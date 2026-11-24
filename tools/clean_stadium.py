# スタジアムの絵(オーナーが用意したもの)から、外枠・壁の広告(スポンサー名・WCC F)・スコアボードの「WCC F」を消す(→docs/14 §14.149)
#   python tools/clean_stadium.py <元の絵.png>  → assets/stadium_night.png
#   座標は 1024×535 の元の絵に合わせてある(絵を差し替えたら測り直す)
import sys
from PIL import Image
SRC=sys.argv[1]
im=Image.open(SRC).convert('RGB'); px=im.load(); W,H=im.size
def is_green(c): return c[1]>c[0]+40 and c[1]>c[2]+20
def bright(c): return sum(c)
# ① 壁の広告: 看板の帯は横にまっすぐなので、広告の無い列(x=250・x=760)の縦の色の並びで、字の画素を塗り直す
clean=[250,760]
prof={y:px[clean[0],y] for y in range(368,394)}
labels=[(30,205),(350,425),(578,706),(840,977)]
for a,b in labels:
    # 広告のすぐ左と右の列の色を、横の位置に合わせて混ぜる(看板の下の縁は端に行くほどわずかに傾くため)
    L={y:px[a-6,y] for y in range(368,394)}; Rr={y:px[b+6,y] for y in range(368,394)}
    for x in range(a,b+1):
        t=(x-a)/max(1,b-a)
        side='R' if a<100 else 'L' if b>900 else ('L' if t<0.5 else 'R')   # 両端の広告は内側の列だけを使う
        prof={y:(L if side=='L' else Rr)[y] for y in L}
        for y in range(372,393):
            c=px[x,y]
            ref=prof[y]
            # 看板の帯の行(372〜385)はまるごと、その下は芝でなければ、広告の無い列の色で塗る(字の暗い縁取りも消す)
            if 372<=y<=385 or not is_green(ref) or not is_green(c): px[x,y]=ref   # 芝にはみ出した字の下の端も
# ② スコアボードの「WCC F」: 字の行(205〜215)の字の範囲を、同じ行のボードの地の色(字の左の x=480)で塗る
for y in range(205,216):
    bg=px[480,y]
    for x in range(490,541): px[x,y]=bg
# ③ 外枠(茶色の縁 8px)を切り落とす
im=im.crop((9,8,W-9,H-8))
im.save('assets/stadium_night.png')
print(im.size)
