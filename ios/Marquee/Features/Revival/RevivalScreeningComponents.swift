import SwiftUI

struct RevivalScreeningTitle: View {
  let work: RevivalWork

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(work.title)
        .font(MarqueeTheme.sans(48, weight: .medium))
        .tracking(-3.5)
        .lineSpacing(-7)
        .fixedSize(horizontal: false, vertical: true)
      Text(revivalWorkMeta(work).isEmpty ? "Public domain in the UK" : revivalWorkMeta(work))
        .font(MarqueeTheme.sans(16))
        .foregroundStyle(MarqueeTheme.muted)
        .lineSpacing(4)
        .padding(.top, 22)
    }
    .padding(.bottom, 52)
    .overlay(alignment: .bottom) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
  }
}

struct RevivalContentNotice: View {
  let notice: String

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("BEFORE YOU START")
        .font(MarqueeTheme.mono(9, weight: .heavy))
        .tracking(1)
        .foregroundStyle(MarqueeTheme.coral)
      Text(notice)
        .font(MarqueeTheme.sans(13))
        .lineSpacing(3)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.vertical, 14)
    .padding(.horizontal, 16)
    .background(MarqueeTheme.coral.opacity(0.08))
    .overlay(alignment: .leading) { Rectangle().fill(MarqueeTheme.coral).frame(width: 3) }
  }
}

struct RevivalPrintConditionView: View {
  let condition: String

  var body: some View {
    let copy = revivalCondition(condition)
    FlowLayout(spacing: 12) {
      Text(copy.label.uppercased())
        .font(MarqueeTheme.mono(10, weight: .bold))
        .tracking(1.5)
        .foregroundStyle(labelColour)
      Text(copy.note)
        .font(MarqueeTheme.serif(15))
        .italic()
    }
  }

  private var labelColour: Color {
    switch condition {
    case "pristine": MarqueeTheme.acid
    case "rough": MarqueeTheme.coral
    default: MarqueeTheme.muted
    }
  }
}

struct RevivalSynopsisView: View {
  @Binding var pendingDestination: ExternalDestination?
  let work: RevivalWork

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(work.synopsis)
        .font(MarqueeTheme.sans(15))
        .lineSpacing(5)
      if let credit = work.synopsisCredit {
        VStack(alignment: .leading, spacing: 8) {
          Text(
            "Extract from the Wikipedia article \(credit.article), used under \(WikipediaTextLicence.name) and passed on to you under the same licence."
          )
          .font(MarqueeTheme.mono(10))
          .lineSpacing(3)
          .foregroundStyle(MarqueeTheme.muted)
          FlowLayout(spacing: 12) {
            creditLink(label: credit.article, url: credit.url, kind: .wikipedia)
            if let licence = WikipediaTextLicence.url {
              creditLink(label: WikipediaTextLicence.name, url: licence, kind: .other)
            }
          }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func creditLink(
    label: String, url: URL, kind: ExternalDestination.Kind
  ) -> some View {
    ExternalLinkButton(
      pendingDestination: $pendingDestination,
      destination: ExternalDestination(url: url, label: label, kind: kind)
    ) {
      HStack(spacing: 5) {
        Text(label)
        Image(systemName: "arrow.up.right")
      }
      .font(MarqueeTheme.sans(12))
      .foregroundStyle(MarqueeTheme.acid)
    }
    .buttonStyle(.plain)
  }
}

struct RevivalTagsView: View {
  let tags: [RevivalTag]

  var body: some View {
    FlowLayout(spacing: 7) {
      ForEach(tags.filter { $0.kind != "language" }) { tag in
        Text(tag.label)
          .font(MarqueeTheme.mono(10))
          .tracking(0.4)
          .foregroundStyle(
            tag.kind == "genre"
              ? MarqueeTheme.acid : tag.kind == "person" ? MarqueeTheme.white : MarqueeTheme.muted
          )
          .padding(.horizontal, 9)
          .padding(.vertical, 5)
          .overlay {
            Rectangle().stroke(tag.kind == "genre" ? MarqueeTheme.acid : MarqueeTheme.line)
          }
      }
    }
  }
}

struct RevivalProvenanceView: View {
  @Binding var pendingDestination: ExternalDestination?
  let work: RevivalWork
  let catalogueTitle: MediaTitle?

  var body: some View {
    VStack(spacing: 0) {
      RevivalProvenanceRow(
        label: "Rights note",
        value: revivalRightsSummary(work) + (work.rightsNote.isEmpty ? "" : " · \(work.rightsNote)")
      )
      RevivalProvenanceRow(label: "UK standing", value: revivalUKStanding(work))
      RevivalProvenanceRow(label: "Hosted by", value: revivalDeliveryNote(work))
      VStack(alignment: .leading, spacing: 5) {
        Text("SOURCE RECORD")
          .font(MarqueeTheme.mono(9))
          .tracking(0.7)
          .foregroundStyle(MarqueeTheme.muted)
        ExternalLinkButton(
          pendingDestination: $pendingDestination,
          destination: ExternalDestination(
            url: work.sourceUrl,
            label: revivalSourceLabel(work.source),
            kind: .other
          )
        ) {
          HStack(spacing: 5) {
            Text(revivalSourceLabel(work.source))
            Image(systemName: "arrow.up.right")
          }
          .font(MarqueeTheme.sans(12))
          .foregroundStyle(MarqueeTheme.acid)
        }
        .buttonStyle(.plain)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, 10)
      .padding(.vertical, 14)
      .overlay(alignment: .bottom) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }

      if let catalogueTitle {
        VStack(alignment: .leading, spacing: 5) {
          Text("IN THE CATALOGUE")
            .font(MarqueeTheme.mono(9))
            .tracking(0.7)
            .foregroundStyle(MarqueeTheme.muted)
          NavigationLink("Open the title card") { TitleDetailView(item: catalogueTitle) }
            .font(MarqueeTheme.sans(12))
            .foregroundStyle(MarqueeTheme.acid)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
      }
    }
    .overlay(alignment: .top) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
  }
}

private struct RevivalProvenanceRow: View {
  let label: String
  let value: String

  var body: some View {
    VStack(alignment: .leading, spacing: 5) {
      Text(label.uppercased())
        .font(MarqueeTheme.mono(9))
        .tracking(0.7)
        .foregroundStyle(MarqueeTheme.muted)
      Text(value).font(MarqueeTheme.sans(12))
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 10)
    .padding(.vertical, 14)
    .overlay(alignment: .bottom) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
  }
}

struct RevivalOtherPrintsView: View {
  let prints: [RevivalPrint]

  var body: some View {
    if !prints.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        RevivalScreeningSectionHeading(
          eyebrow: "\(prints.count + 1) copies of this survive in the archives.",
          title: "Other prints"
        )
        VStack(spacing: 0) {
          ForEach(prints) { print in
            NavigationLink {
              RevivalScreeningView(workID: print.id)
            } label: {
              VStack(alignment: .leading, spacing: 4) {
                Text(print.title).font(MarqueeTheme.sans(15, weight: .bold))
                Text(revivalPrintMeta(print))
                  .font(MarqueeTheme.mono(10))
                  .foregroundStyle(MarqueeTheme.muted)
              }
              .frame(maxWidth: .infinity, alignment: .leading)
              .padding(.vertical, 14)
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

struct RevivalAlsoShowingView: View {
  let works: [RevivalWork]

  var body: some View {
    if !works.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        RevivalScreeningSectionHeading(eyebrow: "Still running down here.", title: "Also showing")
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHStack(alignment: .top, spacing: 13) {
            ForEach(works) { work in RevivalCardView(work: RevivalCard(work: work)) }
          }
          .padding(.bottom, 13)
        }
      }
    }
  }
}

private struct RevivalScreeningSectionHeading: View {
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
    }
    .padding(.bottom, 17)
  }
}
