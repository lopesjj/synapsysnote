// Test HTML structure for table cell alignments
const alignments = {
  h: ["left", "center", "right"],
  v: ["top", "middle", "bottom"]
};

function getTdClasses(h, v) {
  const hClass = h === "center" ? "text-center" : h === "right" ? "text-right" : "text-left";
  const vClass = v === "middle" ? "align-middle" : v === "bottom" ? "align-bottom" : "align-top";
  return `${hClass} ${vClass}`;
}

for (const v of alignments.v) {
  for (const h of alignments.h) {
    console.log(`h: ${h}, v: ${v} -> classes: ${getTdClasses(h, v)}`);
  }
}
