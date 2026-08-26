import Foundation

enum APIError: LocalizedError {
  case invalidURL
  case invalidResponse
  case server(status: Int, message: String)

  var errorDescription: String? {
    switch self {
    case .invalidURL, .invalidResponse:
      "The projection room did not answer properly."
    case .server(_, let message):
      message
    }
  }
}

struct APIClient {
  let baseURL: URL

  func get<Response: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> Response
  {
    try await request(path, query: query, method: "GET", body: Optional<String>.none)
  }

  func send<Response: Decodable, Body: Encodable>(
    _ path: String,
    method: String,
    body: Body
  ) async throws -> Response {
    try await request(path, query: [], method: method, body: body)
  }

  func send<Body: Encodable>(_ path: String, method: String, body: Body) async throws {
    let _: Acknowledgement = try await send(path, method: method, body: body)
  }

  func data<Body: Encodable>(_ path: String, method: String, body: Body) async throws -> Data {
    let request = try makeRequest(path, query: [], method: method, body: body)
    let (data, response) = try await URLSession.shared.data(for: request)

    try validate(response, data: data)
    return data
  }

  private func request<Response: Decodable, Body: Encodable>(
    _ path: String,
    query: [URLQueryItem],
    method: String,
    body: Body?
  ) async throws -> Response {
    let request = try makeRequest(path, query: query, method: method, body: body)
    let (data, response) = try await URLSession.shared.data(for: request)

    try validate(response, data: data)
    return try JSONDecoder().decode(Response.self, from: data)
  }

  private func makeRequest<Body: Encodable>(
    _ path: String,
    query: [URLQueryItem],
    method: String,
    body: Body?
  ) throws -> URLRequest {
    guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
      throw APIError.invalidURL
    }

    components.path = path.hasPrefix("/") ? path : "/\(path)"
    components.queryItems = query.isEmpty ? nil : query

    guard let url = components.url else { throw APIError.invalidURL }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.timeoutInterval = 45
    request.setValue("application/json", forHTTPHeaderField: "Accept")

    if let token = try KeychainStore.readToken() {
      request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }

    if let body {
      request.httpBody = try JSONEncoder().encode(body)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }

    return request
  }

  private func validate(_ response: URLResponse, data: Data) throws {
    guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
    guard 200..<300 ~= http.statusCode else {
      let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data)
      throw APIError.server(
        status: http.statusCode,
        message: payload?.error ?? "Request failed (\(http.statusCode))"
      )
    }
  }
}

private struct ErrorPayload: Decodable { let error: String }
