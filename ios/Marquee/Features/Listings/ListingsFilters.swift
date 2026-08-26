import SwiftUI

struct ListingsFilters: View {
  @ObservedObject var model: ListingsModel
  @State private var showsAdvanced = false

  var body: some View {
    VStack(alignment: .leading, spacing: 20) {
      search
      facet("Kind") {
        chip("Everything", selected: model.mediaType.isEmpty) { model.mediaType = "" }
        chip("Films", selected: model.mediaType == "movie") { model.mediaType = "movie" }
        chip("Series", selected: model.mediaType == "tv") { model.mediaType = "tv" }
      }
      facet("Sort") {
        ForEach(ListingsModel.Sort.allCases) { sort in
          chip(sort.label, selected: model.sort == sort) { model.sort = sort }
        }
      }
      if showsAdvanced {
        if !model.genres.isEmpty {
          facet("Genre") {
            ForEach(model.genres, id: \.self) { genre in
              chip(genre, selected: model.selectedGenres.contains(genre)) {
                model.toggleGenre(genre)
              }
            }
          }
        }
        if !model.keywords.isEmpty {
          facet("Tag") {
            ForEach(model.keywords, id: \.self) { keyword in
              chip(keyword, selected: model.selectedKeywords.contains(keyword)) {
                model.toggleKeyword(keyword)
              }
            }
          }
        }
        if !model.providers.isEmpty { sourceFacet }
        advancedToggle("Show less filters", systemImage: "chevron.up") {
          showsAdvanced = false
        }
      } else if hasAdvancedFacets {
        advancedToggle("Show more filters", systemImage: "chevron.down") {
          showsAdvanced = true
        }
      }
      if model.hasFilters {
        Button("CLEAR FILTERS") { model.clearFilters() }
          .font(MarqueeTheme.mono(9, weight: .bold))
          .tracking(1)
          .foregroundStyle(MarqueeTheme.muted)
          .padding(.bottom, 3)
          .overlay(alignment: .bottom) { Rectangle().fill(MarqueeTheme.muted).frame(height: 1) }
      }
    }
    .padding(.bottom, 28)
    .overlay(alignment: .bottom) { Rectangle().fill(MarqueeTheme.line).frame(height: 1) }
    .onAppear {
      if model.hasAdvancedFilters { showsAdvanced = true }
    }
  }

  private var hasAdvancedFacets: Bool {
    !model.genres.isEmpty || !model.keywords.isEmpty || !model.providers.isEmpty
  }

  private var search: some View {
    MarqueeSearchField(placeholder: "Search listings", text: $model.query)
  }

  private var sourceFacet: some View {
    VStack(alignment: .leading, spacing: 10) {
      facetLabel("Source")
      FlowLayout(spacing: 7) {
        ForEach(model.providers.prefix(24)) { provider in
          Button {
            model.toggleProvider(provider.id)
          } label: {
            HStack(spacing: 7) {
              ProviderBadge(providerID: provider.id, name: provider.name, size: 24)
              Text(provider.name)
            }
            .font(MarqueeTheme.mono(9, weight: .bold))
            .foregroundStyle(
              model.selectedProviderIDs.contains(provider.id)
                ? MarqueeTheme.ink : MarqueeTheme.white
            )
            .padding(.horizontal, 9)
            .frame(height: 38)
            .background(
              model.selectedProviderIDs.contains(provider.id)
                ? MarqueeTheme.acid : Color.clear
            )
            .overlay {
              Rectangle().stroke(
                model.selectedProviderIDs.contains(provider.id)
                  ? MarqueeTheme.acid : MarqueeTheme.line)
            }
          }
          .buttonStyle(.plain)
        }
      }
    }
  }

  private func facet<Content: View>(
    _ title: String,
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      facetLabel(title)
      FlowLayout(spacing: 7) { content() }
    }
  }

  private func facetLabel(_ title: String) -> some View {
    Text(title.uppercased())
      .font(MarqueeTheme.mono(9, weight: .bold))
      .tracking(1.1)
      .foregroundStyle(MarqueeTheme.muted)
  }

  private func chip(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
    Button(label, action: action)
      .font(MarqueeTheme.mono(10, weight: .bold))
      .foregroundStyle(selected ? MarqueeTheme.ink : MarqueeTheme.white)
      .padding(.horizontal, 12)
      .frame(height: 36)
      .background(selected ? MarqueeTheme.acid : Color.clear)
      .overlay {
        Rectangle().stroke(selected ? MarqueeTheme.acid : MarqueeTheme.line)
      }
  }

  private func advancedToggle(
    _ label: String,
    systemImage: String,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Label(label, systemImage: systemImage)
        .font(MarqueeTheme.mono(10, weight: .bold))
        .foregroundStyle(MarqueeTheme.white)
        .frame(maxWidth: .infinity)
        .frame(height: 42)
        .overlay { Rectangle().stroke(MarqueeTheme.line) }
    }
    .buttonStyle(.plain)
  }
}
