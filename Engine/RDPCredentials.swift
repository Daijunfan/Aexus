import Foundation
import Security

struct Request: Decodable {
    let action: String
    let account: String
    let service: String?
    let username: String?
    let password: String?
}
func reply(_ result: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: result)
    FileHandle.standardOutput.write(data)
}
do {
    let request = try JSONDecoder().decode(Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
    let service = request.service ?? "com.djf.toolbox.cloudhosts.rdp"
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: request.account]
    if request.action == "get" {
        var search = query
        search[kSecReturnData as String] = true
        search[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        let status = SecItemCopyMatching(search as CFDictionary, &item)
        if status == errSecItemNotFound {reply(["found": false])}
        else if status != errSecSuccess {reply(["error": "macOS 钥匙串未允许读取此 RDP 凭据", "status": status])}
        else if let data = item as? Data {
            if service == "com.microsoft.rdc.macos" {
                reply(["found": true, "password": String(data: data, encoding: .utf8) ?? ""])
            } else {
                var saved = try JSONSerialization.jsonObject(with: data) as! [String: Any]
                saved["found"] = true
                reply(saved)
            }
        }
    } else if request.action == "set" {
        let data = try JSONSerialization.data(withJSONObject: ["username": request.username ?? "", "password": request.password ?? ""])
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var create = query
            create[kSecValueData as String] = data
            create[kSecAttrLabel as String] = "云主机 RDP · " + (request.username ?? request.account)
            let added = SecItemAdd(create as CFDictionary, nil)
            if added != errSecSuccess {throw NSError(domain: NSOSStatusErrorDomain, code: Int(added))}
        } else if status != errSecSuccess {throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))}
        reply(["saved": true])
    } else if request.action == "remove" {
        let status = SecItemDelete(query as CFDictionary)
        reply(["removed": status == errSecSuccess || status == errSecItemNotFound])
    }
} catch {
    reply(["error": "无法访问 RDP 登录凭据"])
    exit(1)
}
