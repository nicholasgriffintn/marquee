import SwiftUI

enum MarqueeTheme {
  static let paper = Color(red: 0.953, green: 0.941, blue: 0.906)
  static let paperDeep = Color(red: 0.910, green: 0.894, blue: 0.847)
  static let paperLine = Color(red: 0.788, green: 0.773, blue: 0.725)
  static let mutedOnPaper = Color(red: 0.361, green: 0.373, blue: 0.341)
  static let ink = Color(red: 0.067, green: 0.075, blue: 0.059)
  static let panel = Color(red: 0.106, green: 0.122, blue: 0.098)
  static let tile = Color(red: 0.137, green: 0.157, blue: 0.122)
  static let line = Color(red: 0.231, green: 0.247, blue: 0.224)
  static let muted = Color(red: 0.561, green: 0.576, blue: 0.537)
  static let acid = Color(red: 0.788, green: 0.953, blue: 0.365)
  static let blue = Color(red: 0.192, green: 0.341, blue: 0.910)
  static let coral = Color(red: 1.0, green: 0.431, blue: 0.337)
  static let white = Color(red: 1.0, green: 0.996, blue: 0.973)

  static func display(_ size: CGFloat) -> Font { sans(size) }
  static func serif(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .custom("Iowan Old Style", size: size).weight(weight)
  }
  static func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .custom("Avenir Next", size: size).weight(weight)
  }
  static func mono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
    .system(size: size, weight: weight, design: .monospaced)
  }
}

struct MarqueePage: ViewModifier {
  func body(content: Content) -> some View {
    content
      .background(MarqueeTheme.ink.ignoresSafeArea())
      .foregroundStyle(MarqueeTheme.white)
      .toolbarBackground(MarqueeTheme.ink.opacity(0.96), for: .navigationBar, .tabBar)
      .toolbarBackground(.visible, for: .navigationBar, .tabBar)
      .toolbarColorScheme(.dark, for: .navigationBar, .tabBar)
      .tint(MarqueeTheme.acid)
  }
}

extension View {
  func marqueePage() -> some View { modifier(MarqueePage()) }

  func marqueeRootPage() -> some View {
    navigationBarTitleDisplayMode(.inline)
      .marqueePage()
  }
}
