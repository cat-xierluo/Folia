# 远程图片挂起对照（ISS-217）

正常图（data URI，不走网络）：

![正常小图](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)

挂起图 A（e2e 由 route 拦截模拟黑洞，重试后放行）：

![挂起A](https://folio-hang.test/hang-a.png)

挂起图 B（全程挂起，验证条目保留与不崩溃）：

![挂起B](https://folio-hang.test/hang-b.png)
