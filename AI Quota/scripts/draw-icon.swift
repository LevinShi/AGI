import AppKit

// A single Q ring doubles as the quota gauge. Render every macOS icon size
// from vector paths, rather than scaling a small bitmap.
let output = CommandLine.arguments[1]
try FileManager.default.createDirectory(atPath: output, withIntermediateDirectories: true)
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels,
          bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
          colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        let transform = AffineTransform(scale: CGFloat(pixels) / 1024)
        (transform as NSAffineTransform).concat()
        NSColor(calibratedRed: 0.11, green: 0.29, blue: 0.23, alpha: 1).setFill()
        NSBezierPath(roundedRect: NSRect(x: 62, y: 62, width: 900, height: 900), xRadius: 196, yRadius: 196).fill()
        let ring = NSBezierPath(ovalIn: NSRect(x: 268, y: 280, width: 488, height: 488))
        ring.lineWidth = 84
        NSColor(calibratedRed: 0.94, green: 0.96, blue: 0.88, alpha: 1).setStroke()
        ring.stroke()
        let arc = NSBezierPath()
        arc.appendArc(withCenter: NSPoint(x: 512, y: 524), radius: 244, startAngle: 30, endAngle: 83)
        arc.lineWidth = 84; arc.lineCapStyle = .round
        NSColor(calibratedRed: 0.64, green: 0.83, blue: 0.53, alpha: 1).setStroke(); arc.stroke()
        let tail = NSBezierPath()
        tail.move(to: NSPoint(x: 592, y: 422)); tail.line(to: NSPoint(x: 754, y: 260))
        tail.lineWidth = 84; tail.lineCapStyle = .round
        NSColor(calibratedRed: 0.94, green: 0.96, blue: 0.88, alpha: 1).setStroke(); tail.stroke()
        NSGraphicsContext.restoreGraphicsState()
        let filename = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: output).appendingPathComponent(filename))
    }
}
