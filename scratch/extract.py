with open('App_bad.jsx', 'r', encoding='utf-16le') as f:
    text = f.read()

start = text.find('// SEQUENTIAL generation')
if start == -1:
    print('Not sequential?')
else:
    end = text.find('const totalReady', start)
    block = text[start:end]
    # Replace corrupted Cyrillic:
    block = block.replace('Р С™Р В°Р Т‘РЎР‚', 'Кадр')
    block = block.replace('Р С›РЎв‚¬Р С‘Р В±Р С”Р В°:', 'ошибка:')
    with open('scratch/loop.txt', 'w', encoding='utf-8') as out:
        out.write(block)
    print('Extracted!')
