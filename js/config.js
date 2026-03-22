const LANG_COLORS = {
  JavaScript:"#f7df1e",TypeScript:"#3178c6",Python:"#4584b6",Rust:"#ce422b",
  Go:"#00acd7",Java:"#e76f00","C++":"#f34b7d",C:"#a8b9cc","C#":"#9b4993",
  Ruby:"#cc342d",PHP:"#7a86b8",Swift:"#fa7343",Kotlin:"#7f52ff",Dart:"#01579b",
  Shell:"#89e051",HTML:"#e44b23",CSS:"#264de4",Vue:"#41b883",Scala:"#dc322f",
  Haskell:"#5e5086",Elixir:"#6e4a7e",Lua:"#000080",R:"#198ce7",Zig:"#ec915c",
  Nix:"#7e7eff",OCaml:"#ef7a08",Clojure:"#db5855",GLSL:"#5686a5",
  default:"#6e7681"
};

function langColor(l){ return LANG_COLORS[l] || LANG_COLORS.default; }
function nodeR(d){ return Math.max(4, Math.min(10, 4 + Math.log2(Math.max(1, d.stars)) * 0.7)); }
function fmtNum(n){ return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); }
