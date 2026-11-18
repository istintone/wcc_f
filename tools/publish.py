#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公開用を作って GitHub Pages に置く(→docs/01 §1.5)。

    python tools/publish.py

  1. 検証(clubtest.js 1任期)を走らせる。落ちたら公開しない
  2. python build.py --dist で dist/ を作る(実名は入らない。連結した JS の構文もここで確かめる)
  2b. headless Chrome で dist/index.html を開き、起動しきったか(html の data-boot="ok")を確かめる
  3. dist/ の中身だけを gh-pages ブランチとして origin に push する(履歴は持たない。毎回置き換える)

push は外に出す操作なので、実行するのは公開すると決めたときだけ。
"""
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).parent.parent


def run(cmd, cwd=ROOT):
    print("$", " ".join(cmd))
    subprocess.run(cmd, cwd=cwd, check=True)


CHROMES = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
           r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "google-chrome", "chromium"]


def boot_check():
    """公開版が起動しきるか。起動中のエラーは data-boot="err: …" に残る(→src/index.html)"""
    chrome = next((c for c in CHROMES if pathlib.Path(c).is_file() or shutil.which(c)), None)
    if not chrome:
        sys.exit("ERROR: 起動の確認に使う Chrome が見つからない(公開しない)")
    url = (ROOT / "dist" / "index.html").resolve().as_uri() + "?notitle=1"
    r = subprocess.run([chrome, "--headless=new", "--disable-gpu", "--allow-file-access-from-files",
                        "--virtual-time-budget=8000", "--dump-dom", url],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    m = re.search(r'<html[^>]*data-boot="([^"]*)"', r.stdout)
    state = m.group(1) if m else "(印が無い。起動の途中で止まった)"
    print("起動の確認:", state)
    if state != "ok":
        sys.exit("ERROR: 公開版が起動しない: " + state)


def main():
    run(["node", "clubtest.js", "1"], cwd=ROOT / "src" / "tests")
    run([sys.executable, "build.py", "--dist"])
    boot_check()
    url = subprocess.run(["git", "remote", "get-url", "origin"], cwd=ROOT, check=True,
                         capture_output=True, text=True).stdout.strip()
    pack = list((ROOT / "dist").glob("*.local.*"))
    if pack:
        sys.exit("ERROR: dist/ に実名のファイルがある: %s" % pack)
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp) / "site"
        shutil.copytree(ROOT / "dist", work)
        (work / ".nojekyll").write_text("", encoding="utf-8")
        run(["git", "init", "-q", "-b", "gh-pages"], cwd=work)
        run(["git", "-c", "core.autocrlf=false", "add", "-A"], cwd=work)
        run(["git", "-c", "user.name=istintone", "-c", "user.email=istintone@gmail.com",
             "commit", "-q", "-m", "公開用(python build.py --dist)"], cwd=work)
        run(["git", "push", "-f", url, "gh-pages"], cwd=work)
    print("公開した。数分で https://istintone.github.io/wcc_f/ に反映される")


if __name__ == "__main__":
    main()
