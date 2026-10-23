#!/usr/bin/env node
// Generates paper/references.tex from paper/references.json (verified Crossref metadata).
// Usage: node scripts/gen-bib.mjs
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const refs = JSON.parse(readFileSync(join(root, "paper", "references.json"), "utf8"));

function latex(s) {
  if (!s) return "";
  const map = {
    "\\": "\\textbackslash{}",
    "&": "\\&",
    "%": "\\%",
    "#": "\\#",
    "_": "\\_",
    "$": "\\$",
    "{": "\\{",
    "}": "\\}",
    "\u00e9": "\\'e", "\u00e8": "\\`e", "\u00ea": "\\^e", "\u00eb": "\\\"e",
    "\u00e1": "\\'a", "\u00e0": "\\`a", "\u00e2": "\\^a", "\u00e4": "\\\"a",
    "\u00ed": "\\'i", "\u00ec": "\\`i", "\u00ee": "\\^i", "\u00ef": "\\\"i",
    "\u00f3": "\\'o", "\u00f2": "\\`o", "\u00f4": "\\^o", "\u00f6": "\\\"o",
    "\u00fa": "\\'u", "\u00f9": "\\`u", "\u00fb": "\\^u", "\u00fc": "\\\"u",
    "\u00e7": "{\\c c}", "\u00f1": "\\~n", "\u015b": "\\'s", "\u0142": "\\l{}",
    "\u00df": "{\\ss}", "\u2013": "-", "\u2014": "-", "\u2019": "'", "\u2018": "'",
    "\u201c": '"', "\u201d": '"', "\u00c9": "\\'E", "\u00c7": "{\\c C}",
    "\u00c1": "\\'A", "\u00cd": "\\'I", "\u00d3": "\\'O", "\u00da": "\\'U",
  };
  return s.split("").map((ch) => map[ch] ?? ch).join("");
}

// "Family, Given Name" -> IEEE initials form "G. N. Family"
function ieeeAuthor(familyGiven) {
  let [family, ...givenParts] = familyGiven.split(",").map((p) => p.trim());
  const given = givenParts.join(" ").trim();
  // Fix names like "D'Amato"
  family = family.replace(/'([a-z])/g, (m, c) => `'${c.toUpperCase()}`);
  const initials = given
    ? given.split(/\s+/).filter(Boolean).map((w) => `${w[0]}.`).join(" ")
    : "";
  return `${latex(initials ? initials + " " : "")}${latex(family)}`;
}

function pagesOf(r) {
  if (r.pages) return `pp. ${latex(r.pages)}`;
  if (r.article_number) return `Art. no. ${latex(r.article_number)}`;
  return "";
}

const LQ = "``"; // LaTeX left quote
const RQ = "''"; // LaTeX right quote

function joinAuthors(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

// Title-case a cleaned container name (IEEE proceedings style).
function titleCase(s) {
  const small = new Set(["of", "on", "and", "the", "for", "in", "to", "a"]);
  return s
    .split(/\s+/)
    .map((w, i) => {
      if (i > 0 && small.has(w.toLowerCase())) return w.toLowerCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function confName(r) {
  // Extract a conference acronym like CSCW '17 or ICDCS from the event field.
  const acronym = (r.event || "").match(/\(([A-Za-z&]{2,})( ?'\d{2})?\)$/);
  const cont = r.container
    .replace(/^Proceedings of the\s*/i, "")
    .replace(/^Proceedings of\s*/i, "")
    .replace(/^[A-Za-z&]{2,} ?\d{4} ?-\s*/i, "") // "ICASSP 2025 - ..."
    .replace(/\s*conference on/i, " Conf. on")
    .replace(/\s*International on Conference/i, " Int. Conf.")
    .replace(/\s*symposium on/i, " Symp. on")
    .replace(/\s*international conference on/i, " Int. Conf. on")
    .replace(/\s+-\s+\S+\s*'\d{2}$/, "")
    .replace(/\s+the integration challenge.*$/i, "")
    .replace(/[:\s]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const base = titleCase(cont);
  if (acronym && !base.toUpperCase().includes(acronym[1].toUpperCase())) {
    return `${base} (${acronym[1]})`;
  }
  return base;
}

function entry(r) {
  const authors = r.authors.filter((a) => a !== "[AUTHORS TO VERIFY]").map(ieeeAuthor);
  const au = authors.length ? joinAuthors(authors) : "[AUTHORS TO VERIFY]";
  const title = LQ + latex(r.title) + RQ;
  const year = r.year || "n.d.";
  const cont = r.container;
  const vol = r.volume ? `, vol. ${latex(r.volume)}` : "";
  const no = r.issue ? `, no. ${latex(r.issue)}` : "";
  const doi = r.doi ? `, doi: ${latex(r.doi)}.` : ".";

  // Proceedings / conference
  if (cont.toLowerCase().includes("proceedings") || cont.toLowerCase().includes("conference")) {
    return `${au}, ${title}, in \\emph{Proc. ${latex(confName(r))}}, ${year}, ${pagesOf(r)}${doi}`;
  }
  if (r.event && /symposium|workshop|conference|international/i.test(r.event)) {
    return `${au}, ${title}, in \\emph{Proc. ${latex(titleCase(r.event))}}, ${year}, ${pagesOf(r)}${doi}`;
  }
  if (cont.toLowerCase().includes("lecture notes")) {
    const base = r.event
      ? `in \\emph{Proc. ${latex(titleCase(r.event))}} (Lecture Notes in Computer Science${vol})`
      : `in \\emph{Lecture Notes in Computer Science} (LNCS)`;
    return `${au}, ${title}, ${base}, ${year}, ${pagesOf(r)}${doi}`;
  }
  if (cont.toLowerCase().includes("encyclopedia")) {
    return `${au}, ${title}, in \\emph{${latex(cont)}}, ${year}, ${pagesOf(r)}${doi}`;
  }
  // Journal article
  const vn = vol + no;
  const volLine = vn ? `${vn},` : "";
  return `${au}, ${title}, \\emph{${latex(cont)}}${volLine} ${pagesOf(r)}, ${year}${doi}`;
}

const out = [];
out.push("% AUTO-GENERATED from paper/references.json by scripts/gen-bib.mjs - do not edit by hand.");
out.push("\\begin{thebibliography}{99}");
for (const r of refs) {
  out.push("");
  out.push(`\\bibitem{${r.key}}`);
  out.push(entry(r));
}
out.push("");
out.push("\\end{thebibliography}");

mkdirSync(join(root, "paper"), { recursive: true });
writeFileSync(join(root, "paper", "references.tex"), out.join("\n") + "\n");
console.log(`wrote paper/references.tex with ${refs.length} entries`);
console.log("--- preview (first 3 and last 1):");
console.log(out.slice(2, 12).join("\n"));
console.log("...");
console.log(out.slice(-3).join("\n"));
