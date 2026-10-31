"""GuitarSet（https://guitarset.weebly.com/ ・CC BY 4.0）の正解データを、採点用の JSON に変換する。
使い方： python3 guitarset-convert.py 注釈フォルダ 出力ファイル.json
"""
import json, glob, os, sys

SUFFIX = {'maj': '', 'min': 'm', '7': '7', 'maj7': 'maj7', 'min7': 'm7', 'hdim7': 'm7♭5', 'dim': 'dim', 'dim7': 'dim7',
          'aug': 'aug', 'sus4': 'sus4', 'sus2': 'sus2', 'maj6': '6', 'min6': 'm6', '9': '9', 'min9': 'm9', 'maj9': 'maj9'}

def chord_name(label):
    if label in ('N', 'X'):
        return None
    root, _, quality = label.partition(':')
    quality = quality.split('/')[0].split('(')[0] or 'maj'
    return root.replace('b', '♭') + SUFFIX.get(quality, '?' + quality)

ann_dir, out = sys.argv[1], sys.argv[2]
clips = []
for path in sorted(glob.glob(os.path.join(ann_dir, '*.jams'))):
    d = json.load(open(path))
    cid = os.path.basename(path)[:-5]
    player, rest = cid.split('_', 1)
    style = rest.split('-')[0]  # BN1 / Funk2 / Jazz3 / Rock1 / SS2 など
    clip = {'id': cid, 'player': player, 'style': ''.join(c for c in style if not c.isdigit()), 'mode': cid.split('_')[-1],
            'duration': d['file_metadata']['duration'], 'notes': [], 'chords': [], 'beats': []}
    string = 0
    for a in d['annotations']:
        ns = a['namespace']
        if ns == 'note_midi':
            for o in a['data']:
                clip['notes'].append({'t': round(o['time'], 4), 'dur': round(o['duration'], 4), 'midi': round(o['value']), 'string': string})
            string += 1
        elif ns == 'tempo':
            clip['tempo'] = a['data'][0]['value']
        elif ns == 'beat_position':
            clip['beats'] = [round(o['time'], 4) for o in a['data']]
        elif ns == 'chord' and not a['annotation_metadata'].get('data_source'):
            # 楽譜に書かれたコード（演奏の細かい変化ではなく、コード譜としての正解）
            clip['chords'] = [[round(o['time'], 4), chord_name(o['value'])] for o in a['data']]
    clip['notes'].sort(key=lambda n: n['t'])
    clips.append(clip)
json.dump(clips, open(out, 'w'), ensure_ascii=False)
names = {}
for c in clips:
    for _, n in c['chords']:
        names[n] = names.get(n, 0) + 1
print(len(clips), '曲', sorted(names.items(), key=lambda x: -x[1]))
