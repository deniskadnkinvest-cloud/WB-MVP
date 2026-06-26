import subprocess
import re
import sys

try:
    bad_bytes = subprocess.check_output(['git', 'show', 'HEAD:src/App.jsx'])
    bad_text = bad_bytes.decode('utf-8', errors='ignore')

    clean_bytes = subprocess.check_output(['git', 'show', '63d332fea9dc273f5922a074bfe8880850819727:src/App.jsx'])
    clean_text = clean_bytes.decode('utf-8', errors='ignore')
except Exception as e:
    print("Git error:", e)
    sys.exit(1)

def extract_nodes(text, pattern_str):
    pattern = re.compile(r'([\'\"\`])(.*?)\1|>([^<]+)<')
    nodes = []
    for match in pattern.finditer(text):
        val = match.group(2) if match.group(2) is not None else match.group(3)
        if re.search(pattern_str, val):
            nodes.append((match.start(), match.end(), val, match.group(0)))
    return nodes

bad_nodes = extract_nodes(bad_text, r'Р')
clean_nodes = extract_nodes(clean_text, r'[А-Яа-яЁё]')

print(f'Bad: {len(bad_nodes)}, Clean: {len(clean_nodes)}')

if len(bad_nodes) != len(clean_nodes):
    print("Mismatch!")
    for i in range(min(10, len(bad_nodes), len(clean_nodes))):
        print(f"Bad: {bad_nodes[i][2]}  |  Clean: {clean_nodes[i][2]}")
else:
    # Replace backwards to not mess up indices
    fixed_text = bad_text
    for i in range(len(bad_nodes)-1, -1, -1):
        bad_start, bad_end, bad_val, bad_full = bad_nodes[i]
        clean_start, clean_end, clean_val, clean_full = clean_nodes[i]
        
        # We replace the text of the matched node
        # Wait, if bad_full and clean_full use the same quotes/brackets, we can just use clean_full
        if bad_full[0] == clean_full[0] and bad_full[-1] == clean_full[-1]:
            fixed_text = fixed_text[:bad_start] + clean_full + fixed_text[bad_end:]
        else:
            print(f"Format mismatch at {i}: {bad_full} vs {clean_full}")

    with open('src/App.jsx', 'w', encoding='utf-8') as f:
        f.write(fixed_text)
    print("Fixed src/App.jsx written!")
