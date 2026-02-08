import { AppConfig } from "../config.js";

/**
 * MPD transport adapter (UI only)
 * - Mock mode: local state simulation.
 * - REST mode: polls backend and sends commands to /api/mpd/*.
 */
export class MPDClient {
  constructor({refreshMs=1000}={}){
    this.refreshMs = refreshMs;
    this._timer = null;
    this._listeners = new Set();
    this._state = null;
    this.transport = AppConfig.transport || "mock";
    this.baseUrl = AppConfig.restBaseUrl || "/api";
  }

  onUpdate(fn){ this._listeners.add(fn); return ()=>this._listeners.delete(fn); }

  async connect(initialState){
    this._state = structuredClone(initialState);
    this._emit();
    if(this.transport === "mock"){
      this._timer = setInterval(()=>this._tick(), this.refreshMs);
      return;
    }
    await this._refresh();
    this._timer = setInterval(()=>this._refresh(), this.refreshMs);
  }

  disconnect(){
    clearInterval(this._timer);
    this._timer = null;
  }

  getState(){ return this._state; }

  async play(){
    if(this.transport === "mock"){
      this._state.player.state = "play";
      this._emit();
      return;
    }
    await this._cmd("play");
    await this._refresh();
  }

  async pause(){
    if(this.transport === "mock"){
      this._state.player.state = "pause";
      this._emit();
      return;
    }
    await this._cmd("pause");
    await this._refresh();
  }

  async toggle(){
    const s = this._state.player.state;
    if(s === "play") return this.pause();
    if(s === "pause"){
      await this._cmd("resume");
      await this._refresh();
      return;
    }
    return this.play();
  }

  async next(){
    if(this.transport === "mock"){
      const p = this._state.player;
      if(!p.queue.length) return;
      p.index = Math.min(p.queue.length-1, p.index+1);
      p.track = p.queue[p.index] || null;
      p.elapsed = 0;
      p.duration = p.track?.duration || 0;
      p.state = "play";
      this._emit();
      return;
    }
    await this._cmd("next");
    await this._refresh();
  }

  async prev(){
    if(this.transport === "mock"){
      const p = this._state.player;
      if(!p.queue.length) return;
      p.index = Math.max(0, p.index-1);
      p.track = p.queue[p.index] || null;
      p.elapsed = 0;
      p.duration = p.track?.duration || 0;
      p.state = "play";
      this._emit();
      return;
    }
    await this._cmd("prev");
    await this._refresh();
  }

  async playAt(index){
    if(this.transport === "mock"){
      const p = this._state.player;
      if(!p.queue.length) return;
      index = Math.max(0, Math.min(p.queue.length-1, Number(index)));
      p.index = index;
      p.track = p.queue[p.index] || null;
      p.elapsed = 0;
      p.duration = p.track?.duration || 0;
      p.state = "play";
      this._emit();
      return;
    }
    await this._post(`/mpd/play?pos=${encodeURIComponent(index)}`);
    await this._refresh();
  }

  async clearQueue(){
    if(this.transport === "mock"){
      const p = this._state.player;
      p.queue = [];
      p.index = -1;
      p.track = null;
      p.elapsed = 0;
      p.duration = 0;
      p.state = "pause";
      this._emit();
      return;
    }
    await this._cmd("clear");
    await this._refresh();
  }

  async seek(seconds){
    if(this.transport === "mock"){
      const p = this._state.player;
      p.elapsed = Math.max(0, Math.min(p.duration || 0, seconds));
      this._emit();
      return;
    }
    await this._cmd(`seek ${seconds}`);
    await this._refresh();
  }

  async setVolume(vol){
    const next = Math.max(0, Math.min(100, Math.round(vol)));
    if(this.transport === "mock"){
      this._state.player.volume = next;
      this._emit();
      return;
    }
    await this._cmd(`volume ${next}`);
    await this._refresh();
  }

  async setRandom(on){
    if(this.transport === "mock"){
      this._state.player.random = !!on;
      this._emit();
      return;
    }
    await this._post(`/mpd/random?value=${on ? 1 : 0}`);
    await this._refresh();
  }

  async cycleRepeat(){
    if(this.transport === "mock"){
      const p = this._state.player;
      p.repeat = p.repeat === "off" ? "all" : p.repeat === "all" ? "one" : "off";
      this._emit();
      return;
    }
    const cur = this._state.player.repeat;
    const next = cur === "off" ? "all" : cur === "all" ? "one" : "off";
    await this._post(`/mpd/repeat?mode=${encodeURIComponent(next)}`);
    await this._refresh();
  }

  async _post(path){
    await this._fetchJson(path, {method: "POST"});
  }

  async _cmd(cmd){
    await this._fetchJson("/cmd", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({cmd}),
    });
  }

  async _refresh(){
    try {
      let wrapper = await this._fetchJson("/state").catch(()=>null);
      let status = wrapper?.state || wrapper;
      if(!status?.status){
        status = await this._fetchJson("/mpd/status");
      }
      const queue = await this._fetchJson("/mpd/queue").catch(()=>[]);
      this._applyState(status, queue);
      this._emit();
    } catch {
      if(this._state?.player) this._state.player.connected = false;
      this._emit();
    }
  }

  _applyState(statusPayload, queuePayload){
    const st = statusPayload?.status || {};
    const current = statusPayload?.current || statusPayload?.song || null;
    const queue = Array.isArray(queuePayload) ? queuePayload : [];
    const player = this._state.player;

    const elapsed = parseElapsed(st);
    const duration = parseDuration(st, current);
    const index = parseIndex(st, current, queue);
    const track = current ? toTrack(current) : (index >= 0 ? toTrack(queue[index]) : null);

    const volumeRaw = Number(st.volume);
    const hasMixer = Number.isFinite(volumeRaw) && volumeRaw >= 0;

    player.connected = true;
    player.state = st.state || "pause";
    player.canSetVolume = hasMixer;
    if(hasMixer){
      player.volume = volumeRaw;
    }
    player.random = st.random === "1";
    player.repeat = parseRepeat(st);
    player.elapsed = elapsed;
    player.duration = duration || (track?.duration || 0);
    player.track = track;
    player.queue = queue.map(toTrack).filter(Boolean);
    player.index = index;
  }

  async _fetchJson(path, opts){
    const res = await fetch(`${this.baseUrl}${path}`, opts);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if(!body?.ok) throw new Error(body?.error || "API error");
    return body.data;
  }

  // internal mock clock
  _tick(){
    const p = this._state.player;
    if(p.state !== "play") return;

    p.elapsed += 1;
    if(p.elapsed >= (p.duration || 0)){
      // auto-advance
      if(p.repeat === "one"){
        p.elapsed = 0;
      } else if(p.index < p.queue.length-1){
        this.next();
        return;
      } else if(p.repeat === "all" && p.queue.length){
        p.index = 0;
        p.track = p.queue[0];
        p.duration = p.track.duration;
        p.elapsed = 0;
      } else {
        p.state = "pause";
        p.elapsed = p.duration || 0;
      }
    }
    this._emit(false);
  }

  _emit(){
    for(const fn of this._listeners) fn(this._state);
  }
}

function parseElapsed(st){
  if(st.elapsed != null) return Number(st.elapsed) || 0;
  if(st.time){
    const [e] = String(st.time).split(":");
    return Number(e) || 0;
  }
  return 0;
}

function parseDuration(st, current){
  if(st.duration != null) return Number(st.duration) || 0;
  if(st.time){
    const [,d] = String(st.time).split(":");
    return Number(d) || 0;
  }
  if(current?.Time != null) return Number(current.Time) || 0;
  if(current?.duration != null) return Number(current.duration) || 0;
  return 0;
}

function parseIndex(st, current, queue){
  if(st.song != null) return Number(st.song) || 0;
  if(current?.id != null){
    const idx = queue.findIndex((q)=>String(q.id) === String(current.id));
    return idx >= 0 ? idx : -1;
  }
  return -1;
}

function parseRepeat(st){
  const repeat = st.repeat === "1";
  const single = st.single === "1";
  if(repeat && single) return "one";
  if(repeat) return "all";
  return "off";
}

function toTrack(song){
  if(!song) return null;
  const file = song.file || song.File || "";
  if(!file && !song.Title && !song.title) return null;
  const title = song.Title || song.title || (file ? file.split("/").pop() : "");
  const artist = song.Artist || song.artist || song.AlbumArtist || song.albumartist || "";
  const album = song.Album || song.album || "";
  const duration = Number(song.Time ?? song.time ?? song.duration ?? 0) || 0;
  const trackNo = parseTrackNo(song.Track ?? song.track);
  const year = parseYear(song.Date ?? song.date);
  return { path: file, title, artist, album, duration, trackNo, year };
}

function parseTrackNo(val){
  if(!val) return null;
  const v = String(val).split("/")[0];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseYear(val){
  if(!val) return null;
  const v = String(val).slice(0, 4);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
