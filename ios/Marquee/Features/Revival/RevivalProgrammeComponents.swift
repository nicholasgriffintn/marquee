import SwiftUI

struct RevivalPageTitle: View {
  let total: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("The revival house")
        .font(MarqueeTheme.sans(57, weight: .medium))
        .tracking(-4.3)
        .lineSpacing(-8)
        .fixedSize(horizontal: false, vertical: true)
      Text(description)
        .font(MarqueeTheme.sans(16))
        .foregroundStyle(MarqueeTheme.muted)
        .lineSpacing(4)
        .padding(.top, 22)
    }
    .padding(.bottom, 52)
    .overlay(alignment: .bottom) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
  }

  private var description: String {
    let base =
      "The small screen at the back. When the building came down, the sign went in a skip and this did not. The prints are out of copyright, the projectionist is somewhere behind that door, and the ticket is nothing."
    return total > 0
      ? "\(base) \(total.formatted(.number.grouping(.automatic))) in the vault." : base
  }
}

struct RevivalVaultSearch: View {
  @Binding var query: String
  let resultCount: Int
  let total: Int
  let isSearching: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      MarqueeSearchField(placeholder: "Search the vault", text: $query)
      if query.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 {
        Text(
          isSearching
            ? "LOOKING…"
            : "\(resultCount.formatted(.number.grouping(.automatic))) OF \(total.formatted(.number.grouping(.automatic))) IN THE VAULT"
        )
        .font(MarqueeTheme.mono(9))
        .tracking(0.7)
        .foregroundStyle(MarqueeTheme.muted)
      }
    }
  }
}

struct RevivalBillView: View {
  let bill: [RevivalBillSlot]

  var body: some View {
    if !bill.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        RevivalSectionHeading(
          eyebrow: "Programmed for today, and different tomorrow.", title: "Tonight’s bill"
        )
        VStack(spacing: 0) {
          ForEach(bill) { entry in
            NavigationLink {
              RevivalScreeningView(workID: entry.work.id)
            } label: {
              VStack(alignment: .leading, spacing: 5) {
                Text(entry.slot.uppercased())
                  .font(MarqueeTheme.mono(9, weight: .heavy))
                  .tracking(0.8)
                  .foregroundStyle(MarqueeTheme.acid)
                Text(entry.work.title)
                  .font(MarqueeTheme.sans(22, weight: .heavy))
                  .tracking(-0.4)
                  .fixedSize(horizontal: false, vertical: true)
                Text(revivalWorkMeta(entry.work).isEmpty ? entry.note : revivalWorkMeta(entry.work))
                  .font(MarqueeTheme.mono(10))
                  .tracking(0.4)
                  .foregroundStyle(MarqueeTheme.muted)
                  .fixedSize(horizontal: false, vertical: true)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.vertical, 16)
            }
            .buttonStyle(.plain)
            .overlay(alignment: .bottom) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
          }
        }
        .overlay(alignment: .top) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
      }
    }
  }
}

struct RevivalShelfView: View {
  let shelf: RevivalShelf

  var body: some View {
    if !shelf.works.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        RevivalSectionHeading(eyebrow: shelf.description, title: shelf.title)
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(alignment: .top, spacing: 13) {
            ForEach(shelf.works) { work in
              RevivalCardView(work: work)
            }
          }
          .padding(.bottom, 13)
        }
      }
    }
  }
}

struct RevivalSearchResultsView: View {
  let results: [RevivalCard]
  let isSearching: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      RevivalSectionHeading(
        eyebrow: isSearching ? "Going through the shelves." : "What the vault turned up.",
        title: "Search results"
      )
      if isSearching {
        ProgressView().tint(MarqueeTheme.acid).padding(.vertical, 28)
      } else if results.isEmpty {
        Text("Nothing under that name.")
          .font(MarqueeTheme.sans(14))
          .foregroundStyle(MarqueeTheme.muted)
          .padding(28)
          .frame(maxWidth: .infinity, alignment: .leading)
          .overlay { Rectangle().stroke(MarqueeTheme.line, style: StrokeStyle(dash: [5])) }
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(alignment: .top, spacing: 13) {
            ForEach(results) { work in RevivalCardView(work: work) }
          }
          .padding(.bottom, 13)
        }
      }
    }
  }
}

private struct RevivalSectionHeading: View {
  let eyebrow: String
  let title: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(eyebrow.uppercased())
        .font(MarqueeTheme.mono(9))
        .tracking(0.9)
        .foregroundStyle(MarqueeTheme.acid)
      Text(title)
        .font(MarqueeTheme.sans(28, weight: .heavy))
        .tracking(-1.5)
        .lineSpacing(-2)
        .fixedSize(horizontal: false, vertical: true)
    }
    .padding(.bottom, 17)
  }
}

struct RevivalCardView: View {
  let work: RevivalCard

  var body: some View {
    NavigationLink {
      RevivalScreeningView(workID: work.id)
    } label: {
      VStack(alignment: .leading, spacing: 0) {
        Artwork(url: work.stillUrl, seed: work.id)
          .frame(width: 156, height: 234)
          .overlay(alignment: .topLeading) {
            Text(work.mirrored ? "OUR PRINT" : "ON LOAN")
              .font(MarqueeTheme.mono(8))
              .tracking(0.8)
              .padding(.horizontal, 8)
              .padding(.vertical, 5)
              .background(MarqueeTheme.ink.opacity(0.7))
              .padding(8)
          }
        Text(work.title)
          .font(MarqueeTheme.sans(15, weight: .heavy))
          .tracking(-0.3)
          .lineLimit(2)
          .padding(.horizontal, 2)
          .padding(.top, 8)
        Text("FREE TO WATCH HERE")
          .font(MarqueeTheme.mono(9, weight: .heavy))
          .tracking(0.6)
          .foregroundStyle(MarqueeTheme.acid)
          .padding(.top, 6)
        Text(meta)
          .font(MarqueeTheme.mono(8))
          .foregroundStyle(MarqueeTheme.muted)
          .lineLimit(3)
          .padding(.top, 4)
      }
      .frame(width: 156, alignment: .leading)
    }
    .buttonStyle(.plain)
  }

  private var meta: String {
    revivalWorkMeta(work) + (work.condition == "rough" ? " · rough print" : "")
  }
}

struct RevivalProjectionNote: View {
  let seed: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      FlowLayout(spacing: 12) {
        Text("PROJECTION BOX")
          .font(MarqueeTheme.mono(10, weight: .bold))
          .tracking(1.5)
        Text("pinned to the door, undated")
          .font(MarqueeTheme.serif(12))
          .italic()
      }
      .foregroundStyle(MarqueeTheme.muted)
      Text(note)
        .font(MarqueeTheme.mono(14))
        .lineSpacing(7)
      (Text("Pinned up as found. We have not spoken since 1988. — ")
        + Text("The Usher").foregroundStyle(MarqueeTheme.white))
        .font(MarqueeTheme.serif(13))
        .italic()
        .foregroundStyle(MarqueeTheme.muted)
        .padding(.top, 10)
        .overlay(alignment: .top) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 16)
    .background { RevivalStripedBackground() }
    .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.muted).frame(width: 3) }
    .overlay { Rectangle().stroke(MarqueeTheme.line) }
  }

  private var note: String { Self.notes[abs(seed) % Self.notes.count] }

  private static let notes = [
    "Threaded up whatever the vault let me have. Some of it is worth your evening. I make no promises about the rest.",
    "Everything on these shelves is out of copyright, which is not the same as being any good. You have been told.",
    "I check the prints. I do not check the films. That is somebody else's department, and he is on the door.",
    "If a reel jumps, it jumped in 1931 as well. Nothing I can do about that from in here.",
  ]
}

struct RevivalRightsNote: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("ON WHAT WE ARE ALLOWED TO SHOW YOU")
        .font(MarqueeTheme.mono(10, weight: .bold))
        .tracking(1.5)
      Text(
        "Every print here was published as public domain by the archive holding it. That is their claim, and we pass it on. Whether we thread it up ourselves depends on one thing: UK copyright runs for seventy years after the last of the principal director, the screenwriters and the composer has died. Past that, the print is ours to keep and we serve it from our own vault."
      )
      Text(
        "Not past it, and we do not touch the reel. The play button sends you to the archive that holds it and they show it to you, exactly as they would if you had walked in there yourself. Every print says which of the two it is, and why, on its own page. I would rather tell you where a thing came from than have you wonder."
      )
      Text(
        "If you think something here is on the wrong shelf, say so. It comes down the same day, and we argue about it afterwards."
      )
    }
    .font(MarqueeTheme.sans(14))
    .foregroundStyle(MarqueeTheme.muted)
    .lineSpacing(6)
    .padding(.top, 18)
    .overlay(alignment: .top) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
  }
}

private struct RevivalStripedBackground: View {
  var body: some View {
    Canvas { context, size in
      context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(MarqueeTheme.tile))
      var path = Path()
      for offset in stride(from: -size.height, through: size.width, by: 16) {
        path.move(to: CGPoint(x: offset, y: 0))
        path.addLine(to: CGPoint(x: offset + size.height, y: size.height))
      }
      context.stroke(path, with: .color(Color(red: 0.133, green: 0.153, blue: 0.118)), lineWidth: 8)
    }
  }
}
