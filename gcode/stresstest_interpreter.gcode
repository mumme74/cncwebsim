#1 = 0.5
#<scale> = #1
G17 ( Plane X,Y )
G21 ( Millimeter )
G91 ( Incremental )
G40 ( Cancel radius compensation )
G92 X0 Z0 ( Offset coordinate system )
G00 Z-49 (1mm från workpiece)
(Rita F)
G00 X[#<scale>*10] Y#<scale>*10
G01 Z-4 F10
G01 Y#<scale>*100 F500
G01 X#<scale>*50
G00 Z4
G00 X#<scale>*-50 Y#<scale>*-50
G01 Z-4 F10
G01 X#<scale>*20 F100
G00 Z4
(Rita J)
G00 X#<scale>*140 Y#<scale>*50 ;cdff,ffr43y
G01 Z-4 F10
G01 Y#<scale>*-70 F100
G02 X#<scale>*-60 R#<scale>*30
G01 Y#<scale>*20
G03 X#<scale>*60 R#<scale>*30
G00 Z4

;GOTO 98
G00 X#<scale>*-130 Y#<scale>*100
M98 P100 L5 (call subroutine 5 times)

;N98 GOTO 99
G00 X-157.5Y10
M97 N101 L5

(testing IF statements)
#2 = 1 ; Change value on local #2
IF [#2 EQ 1] THEN G0x10y100
IF[#2GT0]THEN G00x-10y10
IF[#2LT3]THENG0x-10y-10
IF[#2GE1]THENG0x-10y10
IF[#2LE1]THENG0x-10y-10
IF[#2NE0]THENG0x-10y10
IF[#2AND1]THENG0x-10y-10
IF[0OR#2]THENG0x-10y10
IF[1XOR#2]THENG0x-10y-10
IF[0]GOTO99
G0x60y-160

(Testing nested loops)
#3=5
WHILE [0 LT #3] DO1
  G0y10x5
  G0x10y5
 #4=4
  WHILE [#4] DO2
    G0y4x-4
    #4=#4-1
  END2
  #3=[#3-1]
END1

N99
(Go Home)
G28 X0 Y0 Z0(Go home)
M30

O100
  G01 Z-4 ( go down)
  G02 X-15 R7.5
  G02 X15 R7.5
  G00 Z4
  G00 X30 ( increment by 30)
  M99 ( return)

N101
  G01 Z-4
  G01 x7.5 y15
  G01 x-15
  G01 x7.5y-15
  G00 Z4
  G00 X30
  M99