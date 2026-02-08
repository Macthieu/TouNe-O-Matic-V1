export function buildMockLibrary(){
  // Small fake dataset, big enough to exercise UI.
  const artists = [
    {id:"a1", name:"Bap Kennedy", albums: 7, tracks: 71},
    {id:"a2", name:"Daft Punk", albums: 4, tracks: 56},
    {id:"a3", name:"Radiohead", albums: 9, tracks: 120},
    {id:"a4", name:"Portishead", albums: 3, tracks: 32},
    {id:"a5", name:"Jethro Tull", albums: 12, tracks: 180},
  ];

  const albums = [
    album("al1","The Sailor's Revenge","Bap Kennedy",2005, [t("Shimnavale",306,1), t("Not A Day Goes By",298,2), t("Jimmy Sanchez",278,3), t("Lonely No More",186,4)]),
    album("al2","Discovery","Daft Punk",2001, [t("One More Time",320,1), t("Aerodynamic",212,2), t("Digital Love",301,3)]),
    album("al3","OK Computer","Radiohead",1997, [t("Airbag",275,1), t("Paranoid Android",387,2), t("No Surprises",229,10)]),
    album("al4","Dummy","Portishead",1994, [t("Mysterons",300,1), t("Sour Times",250,2), t("Roads",306,6)]),
    album("al5","Aqualung","Jethro Tull",1971, [t("Aqualung",391,1), t("Cross-Eyed Mary",250,2)]),
    album("al6","In Rainbows","Radiohead",2007, [t("15 Step",237,1), t("Nude",255,3), t("Weird Fishes",318,4)]),
  ];

  const genres = [
    {name:"Rock", albums: 18},
    {name:"Electronic", albums: 9},
    {name:"Jazz", albums: 6},
    {name:"Folk", albums: 5},
    {name:"Classical", albums: 3},
  ];

  const years = [
    {year: 1971, albums: 2},
    {year: 1994, albums: 3},
    {year: 1997, albums: 4},
    {year: 2001, albums: 3},
    {year: 2005, albums: 2},
    {year: 2007, albums: 2},
  ];

  const playlists = [
    {id:"p1", name:"Favoris du matin", tracks: 34},
    {id:"p2", name:"Route 117", tracks: 120},
    {id:"p3", name:"Test FLAC", tracks: 18},
  ];

  const radios = [
    {id:"r1", name:"SomaFM • Groove Salad", genre:"Downtempo"},
    {id:"r2", name:"Radio Paradise • Main Mix", genre:"Eclectic"},
    {id:"r3", name:"BBC Radio 6", genre:"Alternative"},
    {id:"r4", name:"TSF Jazz", genre:"Jazz"},
  ];

  const favourites = [
    {id:"f1", title:"Discovery", subtitle:"Album • Daft Punk"},
    {id:"f2", title:"SomaFM • Groove Salad", subtitle:"Radio • Downtempo"},
  ];

  const apps = [
    {id:"app1", name:"Spotify", desc:"(placeholder)"},
    {id:"app2", name:"Qobuz", desc:"(placeholder)"},
    {id:"app3", name:"Apple Music", desc:"(placeholder)"},
    {id:"app4", name:"Internet Radio", desc:"Stations"},
  ];

  // Flatten track metadata
  for(const a of albums){
    for(const tr of a.tracks){
      tr.album = a.title;
      tr.artist = a.artist;
      tr.year = a.year;
    }
  }

  return { artists, albums, genres, years, playlists, radios, favourites, apps };

  function album(id, title, artist, year, tracks){
    return { id, title, artist, year, tracks };
  }
  function t(title, duration, trackNo){
    return { id: cryptoId(), title, duration, trackNo };
  }
  function cryptoId(){
    return Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2);
  }
}
