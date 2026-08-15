import struct
def read_float_tiff(path):
    d=open(path,'rb').read()
    le = d[:2]==b'II'; E='<' if le else '>'
    off=struct.unpack(E+'I', d[4:8])[0]
    n=struct.unpack(E+'H', d[off:off+2])[0]
    T={}
    for i in range(n):
        p=off+2+i*12
        tag,typ,cnt=struct.unpack(E+'HHI', d[p:p+8])
        if typ in (3,) and cnt==1: v=struct.unpack(E+'H', d[p+8:p+10])[0]
        elif typ in (4,) and cnt==1: v=struct.unpack(E+'I', d[p+8:p+12])[0]
        else:
            sz={1:1,2:1,3:2,4:4,5:8,11:4,12:8}.get(typ,4)
            fmt={1:'B',3:'H',4:'I',11:'f',12:'d'}.get(typ)
            if fmt is None:
                v=struct.unpack(E+'I', d[p+8:p+12])[0]
            else:
                ptr = p+8 if cnt*sz<=4 else struct.unpack(E+'I', d[p+8:p+12])[0]
                v=list(struct.unpack(E+str(cnt)+fmt, d[ptr:ptr+cnt*sz]))
                if cnt==1: v=v[0]
        T[tag]=v
    W,H=T[256],T[257]
    out=[0.0]*(W*H)
    if 322 in T:  # tiled
        tw,th=T[322],T[323]
        offs=T[324] if isinstance(T[324],list) else [T[324]]
        across=(W+tw-1)//tw
        for i,o in enumerate(offs):
            tx=(i%across)*tw; ty=(i//across)*th
            vals=struct.unpack(E+str(tw*th)+'f', d[o:o+tw*th*4])
            for r in range(th):
                yy=ty+r
                if yy>=H: break
                base=r*tw
                for c in range(tw):
                    xx=tx+c
                    if xx<W: out[yy*W+xx]=vals[base+c]
    else:
        offs=T[273] if isinstance(T[273],list) else [T[273]]
        rps=T.get(278,H); row=0
        for o in offs:
            rows=min(rps,H-row)
            vals=struct.unpack(E+str(rows*W)+'f', d[o:o+rows*W*4])
            out[row*W:(row+rows)*W]=list(vals); row+=rows
    return W,H,out,T
if __name__=='__main__':
    W,H,v,T=read_float_tiff('/tmp/solent.tif')
    fin=[x for x in v if x==x and abs(x)<1e30]
    print('grid',W,'x',H,'  finite',len(fin))
    print('min %.1f  max %.1f' % (min(fin),max(fin)))
    import collections
    print('tilewidth',T.get(322),'tilelength',T.get(323),'tiles',len(T[324]) if isinstance(T[324],list) else 1)
    # sample a few known places (bbox -1.60..-1.00 lon, 50.68..50.92 lat)
    def at(lon,lat):
        x=int((lon-(-1.60))/0.60*(W-1)); y=int((50.92-lat)/0.24*(H-1))
        return v[y*W+x]
    for name,lon,lat in [('Hurst Narrows',-1.5486,50.7060),('Bramble Bank',-1.2867,50.7900),
                         ('Cowes entrance',-1.2960,50.7680),('Lymington River',-1.5150,50.7450),
                         ('mid Solent',-1.3800,50.7550),('Beaulieu bar',-1.3860,50.7830),
                         ('Portsmouth ent',-1.1060,50.7900)]:
        print('  %-16s %8.1f' % (name, at(lon,lat)))
