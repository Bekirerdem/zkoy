// Sunucunun ürettiği metnin İngilizcesi. Oyun Türkçe yazılır; her soket
// `hello`da dilini söyler, hata mesajı o dilde gider. Duyurular ve ifşa
// hikâyesi iki dilde üretilir, istemci kendi dilini gösterir.

export type Lang = "tr" | "en";

/** Türkçe hata → İngilizcesi. Değişkenli olanlar desenle. */
const EXACT: Record<string, string> = {
  "oda dolu": "The room is full.",
  "ad çok uzun": "That name is too long.",
  "bu isim alınmış": "That name is taken.",
  "kura taahhüdü zorunlu": "The draw commitment is missing.",
  "ölüler aday olamaz": "The dead cannot stand.",
  "ölüler oy atamaz": "The dead cannot vote.",
  "aday değil": "Not a candidate.",
  "ölüler gece hamlesi yapamaz": "The dead have no night move.",
  "hedef zaten ölü": "That player is already dead.",
  "vampir kendini yiyemez": "A vampire cannot bite itself.",
  "gözcü kendini sorgulayamaz": "The seer cannot check themselves.",
  "bu rolün gece hamlesi yok": "Your role has no night move.",
  "halef gösterme hakkı yok": "You cannot name a successor.",
  "halef yaşayan biri olmalı": "The successor must be alive.",
  "dava sürerken gün kapanmaz": "The day cannot close during a trial.",
  "dava sürüyor": "A trial is under way.",
  "ölüler suçlayamaz": "The dead cannot accuse.",
  "kendini suçlayamazsın": "You cannot accuse yourself.",
  "bugün zaten yargılandı": "Already tried today.",
  "ölüler destekleyemez": "The dead cannot back an accusation.",
  "kendini destekleyemezsin": "You cannot back an accusation against yourself.",
  "ortada suçlama yok": "There is no accusation to back.",
  "zaten destekliyorsun": "You already back it.",
  "savunma aşamasında değil": "Not in the defence stage.",
  "oylamayı yalnız suçlanan ya da Muhtar açar": "Only the accused or the Muhtar opens the vote.",
  "karar oyu açık değil": "The vote is not open.",
  "sanık kendi davasında oy kullanmaz": "The accused does not vote in their own trial.",
  "kehanet oyu yalnız hayaletlerin": "Only ghosts make prophecies.",
  "vasiyet oyun sırasında yazılır": "Last words are written during the game.",
  "ölüler vasiyet güncelleyemez": "The dead cannot change their last words.",
  "vasiyet en çok 200 karakter": "Last words are at most 200 characters.",
  "vasiyet çok uzun, biraz kısalt": "Your last words are too long, shorten them a little.",
  "ad boş olamaz": "The name cannot be empty.",
  "oturum geçersiz, odaya yeniden katıl": "Session expired, join the room again.",
  "bunu yalnız Muhtar ya da kurucu yapar": "Only the Muhtar or the host can do this.",
  "bunu yalnız kurucu yapar": "Only the host can do this.",
  "bu tur çok fazla hamle yaptın, biraz bekle": "Too many moves this round, wait a little.",
  "hedef seçilmedi": "No player chosen.",
  "oy seçilmedi": "No vote chosen.",
  "gece değil": "It is not night.",
  "gece henüz zorla kapatılamaz, biraz bekleyin": "The night cannot be closed yet, wait a little.",
  "sanık kendi davasını kapatamaz": "The accused cannot close their own trial.",
  "oylama henüz kapatılamaz, biraz bekleyin": "The vote cannot be closed yet, wait a little.",
  "oyun başladıktan sonra atılmaz": "Nobody can be removed once the game has started.",
  "geçersiz hedef": "Invalid player.",
  "masada değilsin": "You are not at this table.",
  "zaten kurucusun": "You are already the host.",
  "kurucu masada, devralamazsın": "The host is here, you cannot take over.",
  "seçim açık değil": "The election is not open.",
  "mesaj çok büyük": "Message too large.",
  "geçersiz mesaj": "Invalid message.",
  "geçersiz hello": "Invalid hello.",
  "ad 1-16 karakter olmalı": "The name must be 1 to 16 characters.",
  "oda kodu eksik": "Room code missing.",
  "geçersiz hamle": "Invalid move.",
  "geçersiz oy": "Invalid vote.",
  "geçersiz komut": "Invalid command.",
  "bilinmeyen mesaj": "Unknown message.",
  "böyle bir oda yok": "No such room.",
  "çok fazla deneme, biraz bekle": "Too many attempts, wait a little.",
  "önce hello gönder": "Send hello first.",
  "çok hızlı oda kuruluyor, biraz bekle": "Rooms are being created too fast, wait a little.",
  "önce odaya katıl": "Join a room first.",
  "çok hızlı, biraz yavaşla": "Too fast, slow down.",
  "sunucu hatası": "Server error.",
};

const PATTERNS: Array<[RegExp, (...g: string[]) => string]> = [
  [/^bu hamle (\S+) fazında yapılır \(şu an: (\S+)\)$/, (want, now) => `This move belongs to the ${want} phase (now: ${now}).`],
  [/^oyuncu yok: (.*)$/, (id) => `No such player: ${id}.`],
  [/^en az (\d+) oyuncu gerek$/, (n) => `At least ${n} players are needed.`],
];

/** Hata mesajı istenen dilde; çevirisi olmayan Türkçe kalır. */
export function errorText(message: string, to: Lang): string {
  if (to === "tr") return message;
  const exact = EXACT[message];
  if (exact) return exact;
  for (const [re, fn] of PATTERNS) {
    const m = message.match(re);
    if (m) return fn(...m.slice(1));
  }
  return message;
}

/** İngilizce rol adları ("O bir köylüydü" → "They were a villager"). */
export const ROLE_EN = { vampir: "vampire", koylu: "villager", doktor: "doctor", gozcu: "seer", deli: "fool" } as const;

/** "a vampire", "an …": bütün rol adları ünsüzle başlar. */
export const aRole = (r: keyof typeof ROLE_EN) => `a ${ROLE_EN[r]}`;
