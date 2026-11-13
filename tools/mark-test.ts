// Bir oda kodunda oynanan oyunları "test" olarak etiketler (ya da etiketi
// kaldırır). Test oyunları /stats ve /games sayaçlarına girmez. Bot provası
// gibi, masa kurulurken `?test=1` ile etiketlenmemiş eski oyunlar içindir.
//
//   bun tools/mark-test.ts <KOD>            etiketle
//   bun tools/mark-test.ts <KOD> --geri-al  etiketi kaldır
//
// Sunucu çalışırken çalıştırılabilir; ZKOY_DB ile aynı dosyayı gösterir.

import { openDb } from "../src/server/db";

const code = process.argv[2]?.toUpperCase();
if (!code) {
  console.error("kullanım: bun tools/mark-test.ts <KOD> [--geri-al]");
  process.exit(2);
}
const undo = process.argv.includes("--geri-al");
const db = openDb();
const before = db.stats();
const changed = db.markTest(code, !undo);
const after = db.stats();
console.log(
  changed === 0
    ? `${code} kodlu oyun bulunamadı.`
    : `${code}: ${changed} oyun ${undo ? "gerçek" : "test"} olarak işaretlendi.`,
);
console.log(`gerçek oyun ${before.games} → ${after.games} · test oyunu ${before.testGames} → ${after.testGames} · mühürlü memo ${before.sealedMemos} → ${after.sealedMemos}`);
