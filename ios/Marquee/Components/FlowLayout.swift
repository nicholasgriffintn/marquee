import SwiftUI

struct FlowLayout: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) -> CGSize {
    let availableWidth = proposal.width ?? .infinity
    var lineWidth: CGFloat = 0
    var lineHeight: CGFloat = 0
    var totalHeight: CGFloat = 0
    var measuredWidth: CGFloat = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      let nextWidth = lineWidth == 0 ? size.width : lineWidth + spacing + size.width

      if nextWidth > availableWidth, lineWidth > 0 {
        totalHeight += lineHeight + spacing
        measuredWidth = max(measuredWidth, lineWidth)
        lineWidth = size.width
        lineHeight = size.height
      } else {
        lineWidth = nextWidth
        lineHeight = max(lineHeight, size.height)
      }
    }

    measuredWidth = max(measuredWidth, lineWidth)
    totalHeight += lineHeight
    return CGSize(width: proposal.width ?? measuredWidth, height: totalHeight)
  }

  func placeSubviews(
    in bounds: CGRect,
    proposal: ProposedViewSize,
    subviews: Subviews,
    cache: inout ()
  ) {
    var x = bounds.minX
    var y = bounds.minY
    var lineHeight: CGFloat = 0

    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)

      if x > bounds.minX, x + size.width > bounds.maxX {
        x = bounds.minX
        y += lineHeight + spacing
        lineHeight = 0
      }

      subview.place(
        at: CGPoint(x: x, y: y),
        anchor: .topLeading,
        proposal: ProposedViewSize(size)
      )
      x += size.width + spacing
      lineHeight = max(lineHeight, size.height)
    }
  }
}
