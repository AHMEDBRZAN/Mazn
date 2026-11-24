#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""يبني index.html من المصادر، أو يفصل index.html المبني إلى مصادر (split)."""
import sys, os, re, json

MARKS = ["YMAP", "SIRAJ", "LOGIC", "SCAN", "PAGE"]
SRC = {"YMAP": "ymap.json", "SIRAJ": "siraj.js", "LOGIC": "logic.js", "SCAN": "scan/scan.js"}

def read(p):
    with open(p, encoding="utf-8") as f: return f.read()

def write(p, s):
    os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    with open(p, "w", encoding="utf-8") as f: f.write(s)

def split():
    html = read("index.html")
    for i, m in enumerate(MARKS):
        start = html.index("/*%s*/" % m) + len("/*%s*/" % m)
        end = html.index("/*%s*/" % MARKS[i+1]) if i+1 < len(MARKS) else html.index("</script>")
        body = html[start:end].strip("\n")
        if m == "PAGE":
            tpl = html[:html.index("/*YMAP*/")] + "/*YMAP*/\n/*SIRAJ*/\n/*LOGIC*/\n/*SCAN*/\n/*PAGE*/\n" + html[end:]
            write("page.src.html", tpl)
        elif m == "YMAP":
            write("ymap.json", body.replace("const YMAP=", "", 1).rstrip().rstrip(";"))
        else:
            write(SRC[m], body)
    print("فُصلت المصادر: page.src.html, ymap.json, siraj.js, logic.js, scan/scan.js")

def build():
    tpl = read("page.src.html")
    ymap = read("ymap.json")
    inject = {"YMAP": "const YMAP=" + ymap.strip() + ";",
              "SIRAJ": read("siraj.js"), "LOGIC": read("logic.js"), "SCAN": read("scan/scan.js")}
    page = tpl.split("/*PAGE*/")[1] if "/*PAGE*/" in tpl else ""
    for m in ["YMAP", "SIRAJ", "LOGIC", "SCAN"]:
        tpl = tpl.replace("/*%s*/" % m, "/*%s*/\n%s\n" % (m, inject[m]))
    write("index.html", tpl)
    print("بُني index.html")

if __name__ == "__main__":
    (split if len(sys.argv) > 1 and sys.argv[1] == "split" else build)()
