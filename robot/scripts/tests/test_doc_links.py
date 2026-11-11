"""Every relative link in robot/ Markdown points at a file or directory that exists."""
import os
import re
from pathlib import Path

ROBOT = Path(__file__).resolve().parents[2]
LINK = re.compile(r'\]\(([^)\s]+)\)')
SKIP_DIRS = {'third_party', 'build', 'install', 'log', 'node_modules', '.native-state'}


def markdown_files():
    for root, dirs, files in os.walk(ROBOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
        for f in files:
            if f.endswith('.md'):
                yield Path(root) / f


def test_relative_markdown_links_resolve():
    broken = []
    for md in markdown_files():
        text = md.read_text(encoding='utf-8', errors='replace')
        text = re.sub(r'```.*?```', '', text, flags=re.DOTALL)      # links inside code blocks are examples
        for target in LINK.findall(text):
            if re.match(r'^[a-z][a-z0-9+.-]*:', target) or target.startswith('#'):
                continue                                             # URL or same-page anchor
            path = target.split('#', 1)[0]
            if path and not (md.parent / path).exists():
                broken.append(f'{md.relative_to(ROBOT)} -> {target}')
    assert not broken, '\n'.join(broken)
