import socket, threading, sys
SRC=('0.0.0.0',2346); DST=('127.0.0.1',2345)
def pump(a,b):
    try:
        while True:
            d=a.recv(65536)
            if not d: break
            b.sendall(d)
    except OSError: pass
    finally:
        for s in (a,b):
            try: s.shutdown(socket.SHUT_RDWR)
            except OSError: pass
            try: s.close()
            except OSError: pass
ls=socket.socket(); ls.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
ls.bind(SRC); ls.listen(4)
print('relay %s -> %s'%(SRC,DST), flush=True)
while True:
    c,_=ls.accept()
    try:
        r=socket.create_connection(DST,5)
    except OSError as e:
        print('dst fail',e,flush=True); c.close(); continue
    c.setsockopt(socket.IPPROTO_TCP,socket.TCP_NODELAY,1)
    r.setsockopt(socket.IPPROTO_TCP,socket.TCP_NODELAY,1)
    threading.Thread(target=pump,args=(c,r),daemon=True).start()
    threading.Thread(target=pump,args=(r,c),daemon=True).start()
