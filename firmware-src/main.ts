// Tilt Plane firmware (v2.0 protocol)
// Kirim satu baris "x,y,a,b" tiap ~40ms (25 Hz):
//   x,y  = akselerometer (tilt untuk belok)
//   a    = tombol A (rem)  — held=1, lepas=0
//   b    = tombol B (gas)  — held=1, lepas=0
// Parser di game (src/input/parser.ts) mengerti format ini & format lama "x:NNN"/"y:NNN".

basic.showIcon(IconNames.Happy)

basic.forever(function () {
    serial.writeLine(
        "" +
        input.acceleration(Dimension.X) +
        "," +
        input.acceleration(Dimension.Y) +
        "," +
        (input.buttonIsPressed(Button.A) ? 1 : 0) +
        "," +
        (input.buttonIsPressed(Button.B) ? 1 : 0)
    )
    basic.pause(40)
})
