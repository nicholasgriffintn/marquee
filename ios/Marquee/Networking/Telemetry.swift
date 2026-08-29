import Foundation

struct TelemetryEvent: Encodable {
  let name: String
  var detail: String?
  var titleId: String?
  var source: String?
  var position: Int?
}

enum Telemetry {
  static func record(_ event: TelemetryEvent, api: APIClient) {
    Task { _ = try? await api.data("/api/events", method: "POST", body: event) }
  }

  static func railImpression(_ section: CatalogSection, api: APIClient) {
    record(
      TelemetryEvent(name: "rail_impression", detail: section.id, source: section.telemetrySource),
      api: api
    )
  }

  static func railClick(
    _ section: CatalogSection,
    item: MediaTitle,
    position: Int,
    api: APIClient
  ) {
    record(
      TelemetryEvent(
        name: "rail_click",
        detail: section.id,
        titleId: item.id,
        source: section.telemetrySource,
        position: position
      ),
      api: api
    )
  }
}
