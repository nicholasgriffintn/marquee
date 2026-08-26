import Foundation

func marqueeHeroTitleSize(
  _ title: String,
  regular: CGFloat,
  long: CGFloat,
  veryLong: CGFloat
) -> CGFloat {
  let longestWord = title.split(whereSeparator: \Character.isWhitespace).map(\.count).max() ?? 0

  if title.count > 46 || longestWord > 20 { return veryLong }
  if title.count > 26 || longestWord > 13 { return long }
  return regular
}
