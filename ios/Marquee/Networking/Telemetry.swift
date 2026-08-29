import Foundation

/// Where a title was served, as signed by the server. The token is opaque here:
/// the app echoes it back so the worker can attribute the event to the set it
/// actually served, rather than trusting a label the app made up.
struct JourneyTicket {
  let token: String
  let rank: Int
  let detail: String
}

enum ClientEvent: String {
  case railImpression = "rail_impression"
  case railClick = "rail_click"
  case titleView = "title_view"
  case providerExit = "provider_exit"
}

actor Telemetry {
  static let shared = Telemetry()

  private struct Journey {
    let token: String
    let rank: Int?
    let startedAt: Date
  }

  /// Matches JOURNEY_TTL_MS on the server; a stale ticket is dropped here rather
  /// than posted for the worker to reject.
  private static let lifetime: TimeInterval = 30 * 60
  private static let limit = 40

  private let api = APIClient(baseURL: AppConfiguration.baseURL)
  private var journeys: [String: Journey] = [:]
  private var order: [String] = []

  nonisolated func remember(_ titleId: String, ticket: JourneyTicket?) {
    Task { await store(titleId, token: ticket?.token, rank: ticket?.rank) }
  }

  nonisolated func remember(_ titleIds: [String], token: String?) {
    Task {
      for (rank, titleId) in titleIds.enumerated() {
        await store(titleId, token: token, rank: rank)
      }
    }
  }

  nonisolated func record(
    _ event: ClientEvent,
    titleId: String? = nil,
    detail: String? = nil,
    ticket: JourneyTicket? = nil,
    providerId: String? = nil,
    monetization: String? = nil
  ) {
    Task {
      await post(
        event,
        titleId: titleId,
        detail: detail,
        ticket: ticket,
        providerId: providerId,
        monetization: monetization
      )
    }
  }

  private func store(_ titleId: String, token: String?, rank: Int?) {
    guard let token, !token.isEmpty else {
      journeys[titleId] = nil
      order.removeAll { $0 == titleId }
      return
    }

    if journeys[titleId] == nil {
      order.append(titleId)
    }

    journeys[titleId] = Journey(token: token, rank: rank, startedAt: Date())

    while order.count > Self.limit, let oldest = order.first {
      journeys[oldest] = nil
      order.removeFirst()
    }
  }

  private func journey(for titleId: String) -> Journey? {
    guard let journey = journeys[titleId] else { return nil }

    guard Date().timeIntervalSince(journey.startedAt) < Self.lifetime else {
      journeys[titleId] = nil
      order.removeAll { $0 == titleId }
      return nil
    }

    return journey
  }

  private func post(
    _ event: ClientEvent,
    titleId: String?,
    detail: String?,
    ticket: JourneyTicket?,
    providerId: String?,
    monetization: String?
  ) async {
    let stored = titleId.flatMap { journey(for: $0) }
    var body: [String: JSONValue] = ["name": .string(event.rawValue)]

    if let titleId { body["titleId"] = .string(titleId) }
    if let detail { body["detail"] = .string(detail) }
    if let providerId { body["providerId"] = .string(providerId) }
    if let monetization { body["monetization"] = .string(monetization) }

    if let token = ticket?.token ?? stored?.token {
      body["journey"] = .string(token)
    }

    if let rank = ticket?.rank ?? stored?.rank {
      body["rank"] = .number(Double(rank))
    }

    _ = try? await api.data("/api/events", method: "POST", body: body)
  }
}

/// Minimal JSON value so an event body can be assembled without a bespoke
/// Encodable struct per event shape.
enum JSONValue: Encodable {
  case string(String)
  case number(Double)

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()

    switch self {
    case .string(let value):
      try container.encode(value)
    case .number(let value):
      try container.encode(value)
    }
  }
}
