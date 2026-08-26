import SwiftUI

struct NotebookView: View {
  @EnvironmentObject private var appState: AppState
  @StateObject private var model = NotebookModel()
  @State private var guestName = ""
  @State private var guestVetoes = ""
  @State private var alertEmail = ""

  var body: some View {
    Group {
      if appState.isSignedIn {
        notebook
      } else {
        ScrollView {
          TicketGate(
            title: "I only keep one of these per ticket.",
            message:
              "Everything the Usher has worked out about you is here. Correct it, set it aside, or tear it out."
          )
        }
      }
    }
    .marqueeRootPage()
  }

  private var notebook: some View {
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 30) {
        HStack(alignment: .top, spacing: 10) {
          AsyncImage(url: AppConfiguration.baseURL.appending(path: "/usher-thinking.png")) {
            image in
            image.resizable().scaledToFit()
          } placeholder: {
            Color.clear
          }
          .frame(width: 112, height: 130)
          VStack(alignment: .leading, spacing: 8) {
            Text("THE USHER'S NOTEBOOK")
              .font(MarqueeTheme.mono(10, weight: .bold))
              .tracking(1.1)
              .foregroundStyle(MarqueeTheme.muted)
            Text("What I have worked out about you.")
              .font(MarqueeTheme.display(34))
              .fontWeight(.semibold)
              .tracking(-1.2)
            Text("Nothing in it is a secret. Correct it, set it aside, or tear it out.")
              .font(MarqueeTheme.sans(14))
              .foregroundStyle(MarqueeTheme.muted)
          }
        }

        if model.isLoading {
          LoadingHouse(label: "Finding my glasses…")
        } else {
          notebookSection(number: 1, title: "What I have written down") { beliefs }
          notebookSection(number: 2, title: "Where you watch") { services }
          notebookSection(number: 3, title: "Who sits with you") { guests }
          notebookSection(number: 4, title: "When I should write") { alerts }
          notebookSection(number: 5, title: "Take it with you") { feeds }
        }

        if !model.error.isEmpty {
          Text(model.error).font(MarqueeTheme.sans(12)).foregroundStyle(MarqueeTheme.coral)
        }
      }
      .padding(18)
      .padding(.bottom, 30)
    }
    .task {
      await model.load(api: appState.api)
      alertEmail = model.alerts?.email ?? ""
    }
    .refreshable { await model.load(api: appState.api) }
  }

  private func notebookSection<Content: View>(
    number: Int, title: String, @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .firstTextBaseline) {
        Text(String(format: "%02d", number)).font(MarqueeTheme.mono(10, weight: .bold))
          .foregroundStyle(MarqueeTheme.coral)
        Text(title).font(MarqueeTheme.display(27)).fontWeight(.semibold)
      }
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(16)
    .background(MarqueeTheme.paper)
    .foregroundStyle(MarqueeTheme.ink)
  }

  @ViewBuilder private var beliefs: some View {
    if model.beliefs.isEmpty {
      Text("The page is blank. Watch a few things and rate them honestly.")
        .font(MarqueeTheme.sans(13)).foregroundStyle(MarqueeTheme.ink.opacity(0.65))
    } else {
      ForEach(model.beliefs) { belief in
        BeliefRow(belief: belief) { action, value, scope in
          Task {
            await model.act(
              on: belief, action: action, value: value, scope: scope, api: appState.api)
          }
        }
        Divider().overlay(MarqueeTheme.ink.opacity(0.18))
      }
    }
  }

  private var services: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Tick the ones you actually pay for. Recommendations will narrow to doors you can open.")
        .font(MarqueeTheme.sans(12)).foregroundStyle(MarqueeTheme.ink.opacity(0.65))
      ForEach(
        model.providers.filter {
          $0.category == "subscription" || appState.selectedProviderIDs.contains($0.id)
        }
      ) { provider in
        Toggle(
          isOn: Binding(
            get: { appState.selectedProviderIDs.contains(provider.id) },
            set: { selected in
              var ids = appState.selectedProviderIDs
              if selected { ids.insert(provider.id) } else { ids.remove(provider.id) }
              Task { await appState.saveProviders(ids) }
            }
          )
        ) {
          HStack {
            Text(provider.mark).font(MarqueeTheme.mono(10, weight: .heavy)).frame(width: 28)
            Text(provider.name).font(MarqueeTheme.sans(13, weight: .bold))
          }
        }
        .tint(MarqueeTheme.blue)
      }
    }
  }

  private var guests: some View {
    VStack(alignment: .leading, spacing: 10) {
      ForEach(model.guests) { guest in
        HStack {
          VStack(alignment: .leading) {
            Text(guest.name).font(MarqueeTheme.sans(13, weight: .bold))
            Text(
              guest.vetoes.isEmpty ? "No hard vetoes" : "No \(guest.vetoes.joined(separator: ", "))"
            )
            .font(MarqueeTheme.mono(9)).foregroundStyle(MarqueeTheme.ink.opacity(0.55))
          }
          Spacer()
          Button("Show out", role: .destructive) {
            Task { await model.removeGuest(guest, api: appState.api) }
          }
          .font(MarqueeTheme.mono(9, weight: .bold))
        }
      }
      notebookField("Name", text: $guestName)
      notebookField("Will not sit through… horror, musicals", text: $guestVetoes)
      Button("Save them a seat") {
        Task {
          await model.saveGuest(name: guestName, vetoes: guestVetoes, api: appState.api)
          guestName = ""
          guestVetoes = ""
        }
      }
      .buttonStyle(NotebookButtonStyle())
      .disabled(guestName.trimmingCharacters(in: .whitespaces).isEmpty)
    }
  }

  @ViewBuilder private var alerts: some View {
    if let configuration = model.alerts {
      VStack(alignment: .leading, spacing: 10) {
        ForEach(configuration.kinds) { kind in
          Toggle(
            kind.kind.replacingOccurrences(of: "_", with: " ").capitalized,
            isOn: Binding(
              get: {
                model.alerts?.kinds.first(where: { $0.kind == kind.kind })?.enabled ?? kind.enabled
              },
              set: { enabled in
                Task { await model.setAlert(kind, enabled: enabled, api: appState.api) }
              }
            )
          )
          .font(MarqueeTheme.sans(13, weight: .bold))
          .tint(MarqueeTheme.blue)
        }
        notebookField("Email address", text: $alertEmail)
          .textInputAutocapitalization(.never)
          .keyboardType(.emailAddress)
        Button(configuration.verified ? "Address confirmed" : "Send confirmation") {
          Task { await model.setAlertEmail(alertEmail, api: appState.api) }
        }
        .buttonStyle(NotebookButtonStyle())
        .disabled(alertEmail.isEmpty || configuration.verified)
      }
    } else {
      Text("The post book is unavailable.").font(MarqueeTheme.sans(13))
    }
  }

  @ViewBuilder private var feeds: some View {
    if let feeds = model.feeds, feeds.subscribed {
      VStack(alignment: .leading, spacing: 10) {
        Text("A calendar and reader key are active.").font(MarqueeTheme.sans(13, weight: .bold))
        if let calendar = feeds.calendarUrl { Link("Open calendar feed", destination: calendar) }
        if let alerts = feeds.alertsUrl { Link("Open alerts feed", destination: alerts) }
        if feeds.calendarUrl == nil {
          Text("The links were only shown when the key was cut. Recut it if you need them again.")
            .font(MarqueeTheme.sans(11)).foregroundStyle(MarqueeTheme.ink.opacity(0.6))
        }
        Button("Take the key back", role: .destructive) {
          Task { await model.removeFeeds(api: appState.api) }
        }
        .font(MarqueeTheme.mono(10, weight: .bold))
      }
    } else {
      VStack(alignment: .leading, spacing: 10) {
        Text("Put upcoming episodes in your calendar and the Usher's notes in your reader.")
          .font(MarqueeTheme.sans(12)).foregroundStyle(MarqueeTheme.ink.opacity(0.65))
        Button("Cut a private key") { Task { await model.createFeeds(api: appState.api) } }
          .buttonStyle(NotebookButtonStyle())
      }
    }
  }

  private func notebookField(_ placeholder: String, text: Binding<String>) -> some View {
    TextField(placeholder, text: text)
      .font(MarqueeTheme.sans(13))
      .padding(10)
      .background(.white.opacity(0.45))
      .overlay { Rectangle().stroke(MarqueeTheme.ink.opacity(0.3)) }
  }
}

private struct BeliefRow: View {
  let belief: Belief
  let act: (String, String?, String?) -> Void
  @State private var editing = false
  @State private var draft = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if editing {
        TextField("Rewrite this note", text: $draft)
          .textFieldStyle(.roundedBorder)
        HStack {
          Button("Put that down instead") {
            act("rewrite", draft, nil)
            editing = false
          }
          Button("Leave it") { editing = false }
        }
        .font(MarqueeTheme.mono(9, weight: .bold))
      } else {
        Text(belief.value).font(MarqueeTheme.display(18)).fontWeight(.medium)
        Text(confidence(belief.confidence) + (belief.edited ? " · in your words" : ""))
          .font(MarqueeTheme.mono(8)).foregroundStyle(MarqueeTheme.ink.opacity(0.55))
        Menu("Change this note") {
          Button("Rewrite") {
            draft = belief.value
            editing = true
          }
          Button("Not tonight") { act("suspend", nil, "tonight") }
          Button("Not this week") { act("suspend", nil, "week") }
          Button("Forget it", role: .destructive) { act("forget", nil, nil) }
        }
        .font(MarqueeTheme.mono(9, weight: .bold))
      }
    }
  }

  private func confidence(_ value: Double) -> String {
    if value >= 0.85 { return "I know this" }
    if value >= 0.6 { return "Fairly sure" }
    if value >= 0.35 { return "It looks that way" }
    return "I may be imagining this"
  }
}

private struct NotebookButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(MarqueeTheme.mono(10, weight: .bold))
      .foregroundStyle(.white)
      .padding(.horizontal, 13).padding(.vertical, 10)
      .background(MarqueeTheme.ink.opacity(configuration.isPressed ? 0.7 : 1))
  }
}
