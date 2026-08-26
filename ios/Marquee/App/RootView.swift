import SwiftUI

struct RootView: View {
  var body: some View {
    TabView {
      tab("Tonight", systemImage: "sparkles", view: TonightView())
      tab("Listings", systemImage: "rectangle.grid.2x2", view: ListingsView())
      tab("Revival", systemImage: "film.stack", view: RevivalView())
      tab("My shelf", systemImage: "books.vertical", view: ShelfView())
      tab("More", systemImage: "ellipsis", view: MoreView())
    }
    .marqueePage()
  }

  private func tab<Content: View>(_ title: String, systemImage: String, view: Content) -> some View
  {
    NavigationStack {
      view
        .toolbar { AccountToolbar() }
    }
    .tabItem { Label(title, systemImage: systemImage) }
  }
}
