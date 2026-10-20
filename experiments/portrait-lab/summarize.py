"""Summarize measured compressed asset bytes, independent of artistic preference."""
import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

ROOT=Path(__file__).resolve().parent
groups=defaultdict(list)
for run in ['initial','revised']:
    for table in ['sizes.csv','indexed-sizes.csv']:
        with (ROOT/'results'/run/table).open(encoding='utf-8') as f:
            for row in csv.DictReader(f):
                family=row['setting'].split('-')[0]
                groups[(family,int(row['size']),row['format'])].append(int(row['bytes']))
summary=[]
for (family,size,fmt),values in sorted(groups.items()):
    summary.append(dict(algorithm=family,size=size,format=fmt,count=len(values),
        min_bytes=min(values),median_bytes=statistics.median(values),max_bytes=max(values),total_bytes=sum(values)))
(ROOT/'results'/'size-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
with (ROOT/'results'/'size-summary.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=list(summary[0]))
    w.writeheader();w.writerows(summary)
for size in [128,256]:
    print(size)
    for fmt in ['png','png-indexed','webp','webp-q85']:
        values=[v for (family,n,format),items in groups.items() if n==size and format==fmt for v in items]
        print(fmt,'median',statistics.median(values),'range',min(values),max(values),'count',len(values))
