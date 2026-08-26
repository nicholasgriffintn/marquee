import Foundation

func isValidYouTubeVideoKey(_ key: String) -> Bool {
  let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
  return (6...15).contains(key.count) && key.unicodeScalars.allSatisfy(allowed.contains)
}
