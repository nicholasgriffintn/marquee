import AVKit
import SwiftUI

struct RevivalView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = RevivalModel()

  var body: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 30) {
        MarqueeMasthead(
          eyebrow: "The revival house",
          title: "The small screen at the back.",
          copy: "Public-domain prints, provenance attached, no ticket required."
        )
        .padding(.horizontal, 18)
        .padding(.top, 16)

        if model.isLoading {
          LoadingHouse(label: "Threading the projector…")
        } else if let programme = model.programme {
          if !programme.bill.isEmpty { bill(programme) }
          ForEach(programme.shelves) { shelf in
            revivalShelf(shelf)
          }
          Text("\(programme.total) prints in the vault")
            .font(MarqueeTheme.mono(9))
            .foregroundStyle(MarqueeTheme.muted)
            .padding(.horizontal, 18)
        } else {
          HouseMessage(title: "No programme on the board.", message: model.error)
            .padding(.horizontal, 18)
        }
      }
      .padding(.bottom, 30)
    }
    .navigationTitle("Revival house")
    .navigationBarTitleDisplayMode(.inline)
    .task { await model.load(api: appState.api) }
    .refreshable { await model.load(api: appState.api) }
    .marqueePage()
  }

  private func bill(_ programme: RevivalProgramme) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("TODAY'S BILL · \(programme.billDate)")
        .font(MarqueeTheme.mono(10, weight: .bold))
        .tracking(1.2)
        .foregroundStyle(MarqueeTheme.acid)
      ForEach(programme.bill) { slot in
        NavigationLink {
          RevivalScreeningView(workID: slot.work.id)
        } label: {
          HStack(spacing: 14) {
            Artwork(url: slot.work.stillUrl, seed: slot.work.id, aspectRatio: 16 / 10)
              .frame(width: 126, height: 82)
            VStack(alignment: .leading, spacing: 4) {
              Text(slot.slot.uppercased()).font(MarqueeTheme.mono(9)).foregroundStyle(
                MarqueeTheme.coral)
              Text(slot.work.title).font(MarqueeTheme.display(21)).fontWeight(.semibold)
              Text(slot.note).font(MarqueeTheme.sans(11)).foregroundStyle(MarqueeTheme.muted)
                .lineLimit(2)
            }
          }
        }
        .buttonStyle(.plain)
        Divider().overlay(MarqueeTheme.line)
      }
    }
    .padding(18)
    .background(MarqueeTheme.panel)
    .padding(.horizontal, 18)
  }

  private func revivalShelf(_ shelf: RevivalShelf) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(shelf.title).font(MarqueeTheme.display(25)).fontWeight(.semibold).padding(
        .horizontal, 18)
      Text(shelf.description).font(MarqueeTheme.sans(12)).foregroundStyle(MarqueeTheme.muted)
        .padding(.horizontal, 18)
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(alignment: .top, spacing: 13) {
          ForEach(shelf.works) { work in
            RevivalCardView(work: work)
          }
        }
        .padding(.horizontal, 18)
      }
    }
  }
}

private struct RevivalCardView: View {
  let work: RevivalCard

  var body: some View {
    NavigationLink {
      RevivalScreeningView(workID: work.id)
    } label: {
      VStack(alignment: .leading, spacing: 7) {
        Artwork(url: work.stillUrl, seed: work.id, aspectRatio: 16 / 10)
          .frame(width: 210, height: 132)
        Text(work.title).font(MarqueeTheme.sans(13, weight: .bold)).lineLimit(2)
        Text(
          [work.year.map(String.init), work.director, revivalRuntime(work.runtimeSeconds)]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        )
        .font(MarqueeTheme.mono(9)).foregroundStyle(MarqueeTheme.muted).lineLimit(1)
      }
      .frame(width: 210, alignment: .leading)
    }
    .buttonStyle(.plain)
  }
}

struct RevivalScreeningView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = RevivalScreeningModel()
  let workID: String

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        if model.isLoading {
          LoadingHouse(label: "Lacing the reel…")
        } else if let screening = model.screening {
          if let player = model.player {
            VideoPlayer(player: player)
              .aspectRatio(16 / 10, contentMode: .fit)
              .background(.black)
              .onAppear { player.play() }
          }
          Text("NOW SHOWING").font(MarqueeTheme.mono(10, weight: .bold)).tracking(1.4)
            .foregroundStyle(MarqueeTheme.acid)
          Text(screening.work.title).font(MarqueeTheme.display(36)).fontWeight(.semibold)
          Text(
            [
              screening.work.year.map(String.init), screening.work.director,
              revivalRuntime(screening.work.runtimeSeconds),
            ].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
          )
          .font(MarqueeTheme.mono(10)).foregroundStyle(MarqueeTheme.muted)
          if let notice = screening.work.contentNotice {
            Text(notice).font(MarqueeTheme.sans(12)).foregroundStyle(MarqueeTheme.coral).padding(12)
              .overlay { Rectangle().stroke(MarqueeTheme.coral) }
          }
          Text(screening.work.synopsis).font(MarqueeTheme.sans(15))
          VStack(alignment: .leading, spacing: 7) {
            Text("THE PRINT").font(MarqueeTheme.mono(9, weight: .bold)).foregroundStyle(
              MarqueeTheme.acid)
            Text(screening.work.rightsNote).font(MarqueeTheme.sans(13)).foregroundStyle(
              MarqueeTheme.muted)
            Link(
              "Check the source record",
              destination: screening.work.rightsUrl ?? screening.work.sourceUrl
            )
            .font(MarqueeTheme.mono(10, weight: .bold))
          }
          .padding(16)
          .background(MarqueeTheme.panel)
        } else {
          HouseMessage(title: "Nothing showing under that name.", message: model.error)
        }
      }
      .padding(18)
    }
    .navigationTitle("Now showing")
    .navigationBarTitleDisplayMode(.inline)
    .task { await model.load(id: workID, api: appState.api) }
    .onDisappear {
      Task { await model.reportProgress(api: appState.api, canSave: appState.isSignedIn) }
    }
    .marqueePage()
  }
}

private func revivalRuntime(_ seconds: Int?) -> String {
  guard let seconds, seconds > 0 else { return "" }
  return runtimeLabel(minutes: seconds / 60)
}
