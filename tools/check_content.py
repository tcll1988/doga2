"""Check lesson answers and local audio references. Requires Python 3.10+ only."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LESSONS = ROOT / "data" / "lessons"
PREFIX = "window.TEXTBOOK_DATA = window.TEXTBOOK_DATA || [];\nwindow.TEXTBOOK_DATA.push(\n"
SUFFIX = "\n);\n"
errors = []


def fail(message):
    errors.append(message)


def track(lesson_id, group, name):
    return ROOT / "assets" / "audio" / "dg2" / f"{lesson_id}k" / group / f"dg2-{lesson_id}k-{group}-{name}.mp3"


def listening_track(number):
    if number <= 35:
        return str(number)
    return f"{number if number % 2 == 0 else number - 1}.{number + 1 if number % 2 == 0 else number}"


def check_audio(path, context):
    if not path.is_file():
        fail(f"{context}: 録音が見つかりません: {path.relative_to(ROOT)}")


def load_lesson(path):
    content = path.read_text(encoding="utf-8")
    if not content.startswith(PREFIX) or not content.endswith(SUFFIX):
        fail(f"{path.name}: ファイル先頭・末尾の読み込み用コードが変わっています")
        return None
    try:
        return json.loads(content[len(PREFIX):-len(SUFFIX)])
    except json.JSONDecodeError as exc:
        fail(f"{path.name}: JSONの書式エラー（{exc.lineno}行）: {exc.msg}")
        return None


def check_lesson(data, path):
    lesson_id = data.get("id")
    if not isinstance(lesson_id, int):
        fail(f"{path.name}: id は数字にしてください")
        return 0, 0, 0
    label = f"第{lesson_id}課"
    questions = data.get("questions", [])
    points = data.get("points", [])
    vocabulary = data.get("vocabulary", [])
    if [q.get("number") for q in questions] != list(range(1, 46)):
        fail(f"{label}: questions は1～45番を順番どおりに入れてください")
    for index, point in enumerate(points, 1):
        if not point.get("zh") or not point.get("ja"):
            fail(f"{label} 表現{index}: 中国語と日本語が必要です")
        check_audio(track(lesson_id, "p", index), f"{label} 表現{index}")
    for index, word in enumerate(vocabulary, 1):
        if not all(word.get(field) for field in ("zh", "py", "ja")):
            fail(f"{label} 単語{index}: zh、py、ja が必要です")
        if word.get("audioUrl"):
            relative = Path(word["audioUrl"])
            if relative.is_absolute() or ".." in relative.parts:
                fail(f"{label} 単語{index}: audioUrl は教材内の相対パスにしてください")
            else:
                check_audio(ROOT / relative, f"{label} 単語{index}")
        elif word.get("audioTrack"):
            check_audio(track(lesson_id, "t", word["audioTrack"]), f"{label} 単語{index}")
        else:
            fail(f"{label} 単語{index}: audioTrack または audioUrl が必要です")
    for q in questions:
        number = q.get("number")
        context = f"{label} 第{number}問"
        if q.get("type") not in ("choice", "trueFalse"):
            fail(f"{context}: type は choice または trueFalse です")
        allowed = set(q.get("choices", {})) if q.get("type") == "choice" else {"true", "false"}
        correct = q.get("correct")
        if not isinstance(correct, list) or not correct or not set(correct) <= allowed:
            fail(f"{context}: correct が選択肢と一致しません")
        if not q.get("script"):
            fail(f"{context}: 聴解原文 script がありません")
        if isinstance(number, int):
            check_audio(track(lesson_id, "l", listening_track(number)), context)
    return len(points), len(vocabulary), len(questions)


def main():
    files = sorted(LESSONS.glob("lesson-*.js"))
    if len(files) != 5:
        fail(f"課ファイルは5個必要です（現在{len(files)}個）")
    ids = []
    totals = [0, 0, 0]
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for path in files:
        if f'data/lessons/{path.name}' not in html:
            fail(f"index.html で {path.name} を読み込んでいません")
        data = load_lesson(path)
        if data is None:
            continue
        ids.append(data.get("id"))
        counts = check_lesson(data, path)
        totals = [a + b for a, b in zip(totals, counts)]
    if ids != [1, 2, 3, 4, 5]:
        fail(f"課番号・ファイル順が一致しません: {ids}")
    if not (ROOT / "assets" / "動画2テキスト.pdf").is_file():
        fail("元教材PDFがありません")
    if errors:
        print("教材チェック: 修正が必要です", file=sys.stderr)
        for error in errors:
            print("- " + error, file=sys.stderr)
        return 1
    print(f"教材チェック完了: {len(files)}課、表現{totals[0]}項目、単語{totals[1]}項目、聴解{totals[2]}問。録音・解答も確認しました。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
