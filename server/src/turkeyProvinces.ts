// Turkiye'nin 81 ili arasindaki kara komsulugu - "Yakindakiler" gizlilik
// modunda artik SADECE host'un ili degil, ona KOMSU illerdeki kullanicilar
// da odayi gorebiliyor (bkz. rooms.ts visibleToViewer). Statik bir cografi
// gercek oldugu icin disaridan bir API'ye ihtiyac yok, sabit tutuluyor.
// Best-effort bir liste - eksik/yanlis bir komsuluk fark edilirse kolayca
// buradan duzeltilebilir.
const EDGES: [string, string][] = [
  ["adana", "mersin"], ["adana", "nigde"], ["adana", "kayseri"], ["adana", "kahramanmaras"], ["adana", "osmaniye"], ["adana", "hatay"],
  ["adiyaman", "malatya"], ["adiyaman", "kahramanmaras"], ["adiyaman", "gaziantep"], ["adiyaman", "sanliurfa"], ["adiyaman", "diyarbakir"],
  ["afyonkarahisar", "kutahya"], ["afyonkarahisar", "usak"], ["afyonkarahisar", "denizli"], ["afyonkarahisar", "burdur"], ["afyonkarahisar", "isparta"], ["afyonkarahisar", "konya"], ["afyonkarahisar", "eskisehir"],
  ["agri", "kars"], ["agri", "igdir"], ["agri", "van"], ["agri", "mus"], ["agri", "erzurum"],
  ["amasya", "samsun"], ["amasya", "tokat"], ["amasya", "corum"], ["amasya", "yozgat"],
  ["ankara", "cankiri"], ["ankara", "kirikkale"], ["ankara", "kirsehir"], ["ankara", "aksaray"], ["ankara", "konya"], ["ankara", "eskisehir"], ["ankara", "bolu"],
  ["antalya", "burdur"], ["antalya", "isparta"], ["antalya", "konya"], ["antalya", "karaman"], ["antalya", "mersin"], ["antalya", "mugla"],
  ["artvin", "rize"], ["artvin", "erzurum"], ["artvin", "ardahan"],
  ["aydin", "izmir"], ["aydin", "manisa"], ["aydin", "denizli"], ["aydin", "mugla"],
  ["balikesir", "canakkale"], ["balikesir", "manisa"], ["balikesir", "kutahya"], ["balikesir", "bursa"], ["balikesir", "izmir"],
  ["bilecik", "bursa"], ["bilecik", "kutahya"], ["bilecik", "eskisehir"], ["bilecik", "sakarya"],
  ["bingol", "elazig"], ["bingol", "diyarbakir"], ["bingol", "mus"], ["bingol", "erzurum"], ["bingol", "erzincan"], ["bingol", "tunceli"],
  ["bitlis", "van"], ["bitlis", "siirt"], ["bitlis", "mus"], ["bitlis", "batman"],
  ["bolu", "duzce"], ["bolu", "zonguldak"], ["bolu", "karabuk"], ["bolu", "cankiri"], ["bolu", "eskisehir"], ["bolu", "sakarya"],
  ["burdur", "isparta"], ["burdur", "denizli"], ["burdur", "mugla"],
  ["bursa", "yalova"], ["bursa", "kocaeli"], ["bursa", "sakarya"], ["bursa", "kutahya"],
  ["canakkale", "edirne"],
  ["cankiri", "kastamonu"], ["cankiri", "karabuk"], ["cankiri", "corum"], ["cankiri", "yozgat"], ["cankiri", "kirikkale"],
  ["corum", "samsun"], ["corum", "yozgat"], ["corum", "kirikkale"], ["corum", "tokat"], ["corum", "sinop"],
  ["denizli", "mugla"], ["denizli", "usak"], ["denizli", "manisa"],
  ["diyarbakir", "mus"], ["diyarbakir", "batman"], ["diyarbakir", "mardin"], ["diyarbakir", "sanliurfa"], ["diyarbakir", "elazig"],
  ["duzce", "sakarya"], ["duzce", "zonguldak"],
  ["edirne", "kirklareli"], ["edirne", "tekirdag"],
  ["elazig", "malatya"], ["elazig", "tunceli"],
  ["erzincan", "erzurum"], ["erzincan", "bayburt"], ["erzincan", "gumushane"], ["erzincan", "sivas"], ["erzincan", "tunceli"],
  ["erzurum", "ardahan"], ["erzurum", "kars"], ["erzurum", "mus"], ["erzurum", "bayburt"], ["erzurum", "rize"],
  ["eskisehir", "kutahya"],
  ["gaziantep", "kahramanmaras"], ["gaziantep", "sanliurfa"], ["gaziantep", "kilis"],
  ["giresun", "trabzon"], ["giresun", "gumushane"], ["giresun", "sivas"], ["giresun", "ordu"],
  ["gumushane", "trabzon"], ["gumushane", "bayburt"], ["gumushane", "sivas"],
  ["hakkari", "van"], ["hakkari", "sirnak"],
  ["hatay", "osmaniye"], ["hatay", "kahramanmaras"], ["hatay", "gaziantep"],
  ["igdir", "kars"],
  ["isparta", "konya"],
  ["istanbul", "kocaeli"], ["istanbul", "tekirdag"],
  ["izmir", "manisa"],
  ["kahramanmaras", "osmaniye"], ["kahramanmaras", "malatya"], ["kahramanmaras", "sivas"], ["kahramanmaras", "kayseri"],
  ["karabuk", "bartin"], ["karabuk", "kastamonu"], ["karabuk", "zonguldak"],
  ["karaman", "konya"], ["karaman", "mersin"],
  ["kars", "ardahan"],
  ["kastamonu", "bartin"], ["kastamonu", "sinop"], ["kastamonu", "samsun"],
  ["kayseri", "sivas"], ["kayseri", "yozgat"], ["kayseri", "nevsehir"], ["kayseri", "nigde"],
  ["kirikkale", "yozgat"], ["kirikkale", "kirsehir"],
  ["kirklareli", "tekirdag"],
  ["kirsehir", "yozgat"], ["kirsehir", "nevsehir"], ["kirsehir", "aksaray"],
  ["kocaeli", "sakarya"], ["kocaeli", "yalova"],
  ["konya", "aksaray"], ["konya", "nigde"], ["konya", "mersin"],
  ["kutahya", "usak"], ["kutahya", "manisa"],
  ["malatya", "sivas"],
  ["manisa", "usak"],
  ["mardin", "batman"], ["mardin", "sirnak"], ["mardin", "sanliurfa"],
  ["mersin", "nigde"],
  ["mus", "van"],
  ["nevsehir", "nigde"], ["nevsehir", "aksaray"],
  ["nigde", "aksaray"],
  ["ordu", "sivas"], ["ordu", "tokat"], ["ordu", "samsun"],
  ["rize", "trabzon"], ["rize", "bayburt"],
  ["sakarya", "bilecik"],
  ["samsun", "sinop"], ["samsun", "tokat"],
  ["siirt", "batman"], ["siirt", "sirnak"],
  ["sivas", "yozgat"], ["sivas", "tokat"],
  ["sanliurfa", "sirnak"],
  ["tekirdag", "canakkale"],
  ["tokat", "yozgat"],
  ["trabzon", "bayburt"],
  ["tunceli", "erzurum"],
  ["van", "sirnak"],
  ["zonguldak", "bartin"],
];

const neighborMap = new Map<string, Set<string>>();
function addEdge(a: string, b: string) {
  if (!neighborMap.has(a)) neighborMap.set(a, new Set());
  if (!neighborMap.has(b)) neighborMap.set(b, new Set());
  neighborMap.get(a)!.add(b);
  neighborMap.get(b)!.add(a);
}
EDGES.forEach(([a, b]) => addEdge(a, b));

export function areNeighboringProvinces(a: string, b: string): boolean {
  return neighborMap.get(a)?.has(b) ?? false;
}

// "İstanbul" -> "istanbul", "Kırşehir" -> "kirsehir" - ipapi.co'nun donus
// formatindan (diakritikli/diakritiksiz) bagimsiz, tutarli karsilastirma icin.
export function normalizeProvince(name: string): string {
  return name
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/i̇/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();
}
