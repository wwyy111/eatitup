import ApplicationServices
import Foundation

func emit(_ type: String, _ event: CGEvent) {
  let point = event.location
  let line = "\(type) \(Int(point.x.rounded())) \(Int(point.y.rounded()))\n"
  if let data = line.data(using: .utf8) {
    FileHandle.standardOutput.write(data)
  }
}

let eventMask = (1 << CGEventType.leftMouseDown.rawValue)
  | (1 << CGEventType.leftMouseDragged.rawValue)
  | (1 << CGEventType.leftMouseUp.rawValue)

guard let eventTap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .headInsertEventTap,
  options: .listenOnly,
  eventsOfInterest: CGEventMask(eventMask),
  callback: { _, type, event, _ in
    if type == .leftMouseDown {
      emit("down", event)
    } else if type == .leftMouseDragged {
      emit("drag", event)
    } else if type == .leftMouseUp {
      emit("up", event)
    }

    return Unmanaged.passUnretained(event)
  },
  userInfo: nil
) else {
  FileHandle.standardError.write(Data("ERROR:event-tap-unavailable\n".utf8))
  exit(2)
}

let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, eventTap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: eventTap, enable: true)
CFRunLoopRun()
