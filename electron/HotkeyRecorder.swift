import ApplicationServices
import Foundation

let modifierMask = CGEventFlags.maskCommand
  .union(.maskControl)
  .union(.maskAlternate)
  .union(.maskShift)

let keyNamesByCode: [Int64: String] = [
  0: "A",
  1: "S",
  2: "D",
  3: "F",
  4: "H",
  5: "G",
  6: "Z",
  7: "X",
  8: "C",
  9: "V",
  11: "B",
  12: "Q",
  13: "W",
  14: "E",
  15: "R",
  16: "Y",
  17: "T",
  18: "1",
  19: "2",
  20: "3",
  21: "4",
  22: "6",
  23: "5",
  24: "=",
  25: "9",
  26: "7",
  27: "-",
  28: "8",
  29: "0",
  30: "]",
  31: "O",
  32: "U",
  33: "[",
  34: "I",
  35: "P",
  36: "Return",
  37: "L",
  38: "J",
  39: "'",
  40: "K",
  41: ";",
  42: "\\",
  43: ",",
  44: "/",
  45: "N",
  46: "M",
  47: ".",
  48: "Tab",
  49: "Space",
  50: "`",
  51: "Delete",
  53: "Escape",
  69: "+",
  71: "Clear",
  75: "/",
  76: "Return",
  78: "-",
  81: "=",
  82: "0",
  83: "1",
  84: "2",
  85: "3",
  86: "4",
  87: "5",
  88: "6",
  89: "7",
  91: "8",
  92: "9",
  96: "F5",
  97: "F6",
  98: "F7",
  99: "F3",
  100: "F8",
  101: "F9",
  103: "F11",
  105: "F13",
  106: "F16",
  107: "F14",
  109: "F10",
  111: "F12",
  113: "F15",
  115: "Home",
  116: "PageUp",
  117: "ForwardDelete",
  118: "F4",
  119: "End",
  120: "F2",
  121: "PageDown",
  122: "F1",
  123: "Left",
  124: "Right",
  125: "Down",
  126: "Up"
]

func emit(_ text: String) {
  if let data = "\(text)\n".data(using: .utf8) {
    FileHandle.standardOutput.write(data)
  }
}

func hotkeyString(for event: CGEvent) -> String? {
  let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
  guard let keyName = keyNamesByCode[keyCode] else {
    return nil
  }

  let flags = event.flags.intersection(modifierMask)
  var parts: [String] = []

  if flags.contains(.maskCommand) {
    parts.append("Command")
  }

  if flags.contains(.maskControl) {
    parts.append("Control")
  }

  if flags.contains(.maskAlternate) {
    parts.append("Option")
  }

  if flags.contains(.maskShift) {
    parts.append("Shift")
  }

  parts.append(keyName)
  return parts.joined(separator: "+")
}

let eventMask = (1 << CGEventType.keyDown.rawValue)

guard let eventTap = CGEvent.tapCreate(
  tap: .cgSessionEventTap,
  place: .headInsertEventTap,
  options: .defaultTap,
  eventsOfInterest: CGEventMask(eventMask),
  callback: { _, type, event, _ in
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
      return Unmanaged.passUnretained(event)
    }

    if type == .keyDown, let hotkey = hotkeyString(for: event) {
      emit(hotkey)
      return nil
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
