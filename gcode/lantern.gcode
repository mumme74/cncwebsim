(Assumes workpiece 600x500x1.5mm)
(Sheetmetal, mill simulates a cutter)
G17 ( Plane X,Y )
G21 ( Millimeter )
G90 ( Absolute )
G40 ( Cancel radius compensation )
G92 X0 Y0 Z0 ( Offset coordinate system )

(Input parameters)
#<row_sz>  =8  (Sides per row)
#<no_rows> =5  (How many rows(sides))
#<tri_rsz> =3  (Trian. per row)
#<tri_rows>=5  (How many trian. rows)
#<space_x> =5  (How far apart in x)
#<space_y> =-3 (How far apart in y)
#<sp_tri_y>=8
#<side_pos_x> = 5
#<side_pos_y> = 5
#<tri_pos_x>=450
#<tri_pos_y>=10

(Logic starts here)
#<s_cnt>=#<row_sz>*#<no_rows>+1
G0 z3

(Sides)
G0 x#<side_pos_x> y#<side_pos_y>
G91 (incremental)

#<_loop_cnt> = 1
#<_dir> = 1
WHILE [#<_loop_cnt> LT #<s_cnt>] DO1
  M98 P2
  IF [#<_loop_cnt>MOD #<row_sz> NE 0] GOTO 1
    G90 (Change to next row)
    G0 X#<side_pos_x> Y[[100+#<space_y>]*#<_loop_cnt>/8]
    G91
    GOTO 2
  N1 (Else move)
    G0 x28+#<space_x> y75*#<_dir>
  N2
  #<_dir>=#<_dir>*-1
  #<_loop_cnt> = #<_loop_cnt>+1
END1

G90 (Absolute)
G0 x#<tri_pos_x> y#<tri_pos_y>
G91 (Incremental)

(Triangles - BasePlates)
#<_loop_cnt>=1
#<_dir>=-1
#<t_cnt>=#<tri_rsz>*#<tri_rows>+1
WHILE[#<_loop_cnt>LT#<t_cnt>]DO1
  M98 P3
  IF[#<_loop_cnt> MOD #<tri_rsz> EQ 0] GOTO11
    (Continue on same row)
    G0 x#<space_x>+33 y-90*#<_dir>
    ;IF[#<_dir>EQ1]THEN G0y-141
    GOTO 12
  N11 (ELSE )
    G90 (move to next row)
    G0 x#<tri_pos_x> y[#<tri_pos_y> + [90+#<sp_tri_y>] * #<_loop_cnt> / #<tri_rsz>]
    G91 (Incremental)
    #<_dir>=#<_dir>*-1
  N12
  #<_dir>=#<_dir>*-1 (Flip-Flop)
  #<_loop_cnt>=#<_loop_cnt>+1 (Loop)
END1


G90 G00 X0y0z+95
M30

O2 (Procedure, repeats X times)
  (Outer contours)
  G01 z-5
      x40 y#<_dir>*100
      x10
      X40 y#<_dir>*-100
      x-12
      x-5 y#<_dir>*12
      x-55
      x-5 y#<_dir>*-12
      x-13
      z5
  (Inner contours)
  G00 x22y#<_dir>*25
  G01 z-5
      x17y#<_dir>*45
      x10.5
      x17y#<_dir>*-45
      x-44.5
      z5
  M99

O3 (Cut baseplates)
  G01 z-5
      x70
      x-35 y#<_dir>*-70
      x-35 y#<_dir>*70
      z5
  M99
