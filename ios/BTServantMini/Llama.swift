// The model on the phone: llama.cpp (Metal on a device, the CPU in the simulator), one completion at a time, greedy, like
// llama-server in the Android app. The page sends the whole prompt (the call-sheet template with the question in it).
import Foundation
import llama

enum LlamaError: LocalizedError {
    case load, context, tooLong(Int), decode(Int32)
    var errorDescription: String? {
        switch self {
        case .load: return "the model file could not be loaded"
        case .context: return "the model could not start"
        case .tooLong(let n): return "the question is too long (\(n) tokens)"
        case .decode(let rc): return "the model stopped (llama_decode \(rc))"
        }
    }
}

/// Not thread-safe: Engine calls it from one serial queue.
final class Llama {
    private let model: OpaquePointer
    private let ctx: OpaquePointer
    private let vocab: OpaquePointer

    init(path: String) throws {
        llama_backend_init()
        var mp = llama_model_default_params()
        #if targetEnvironment(simulator)
        mp.n_gpu_layers = 0
        #else
        mp.n_gpu_layers = 99
        #endif
        guard let m = llama_model_load_from_file(path, mp) else { throw LlamaError.load }
        var cp = llama_context_default_params()
        cp.n_ctx = 2048 // as the Android app (llama-server -c 2048)
        cp.n_batch = 2048 // the whole prompt in one llama_decode
        let threads = Int32(max(1, min(4, ProcessInfo.processInfo.activeProcessorCount - 2)))
        cp.n_threads = threads
        cp.n_threads_batch = threads
        #if targetEnvironment(simulator)
        cp.op_offload = false // no Metal work in the simulator (CI's Mac has only a virtual GPU)
        #endif
        guard let c = llama_init_from_model(m, cp) else {
            llama_model_free(m)
            throw LlamaError.context
        }
        model = m
        ctx = c
        vocab = llama_model_get_vocab(m)
    }

    deinit {
        llama_free(ctx)
        llama_model_free(model)
    }

    /// The text the model writes after `prompt`, up to `nPredict` tokens, an end-of-generation token or a stop string.
    func complete(prompt: String, nPredict: Int, stop: [String]) throws -> String {
        llama_memory_clear(llama_get_memory(ctx), true)
        var tokens = tokenize(prompt)
        let room = Int(llama_n_ctx(ctx)) - nPredict
        if tokens.isEmpty || tokens.count >= room { throw LlamaError.tooLong(tokens.count) }

        let sampler = llama_sampler_chain_init(llama_sampler_chain_default_params())
        defer { llama_sampler_free(sampler) }
        llama_sampler_chain_add(sampler, llama_sampler_init_greedy())

        var rc = tokens.withUnsafeMutableBufferPointer { llama_decode(ctx, llama_batch_get_one($0.baseAddress, Int32($0.count))) }
        if rc != 0 { throw LlamaError.decode(rc) }

        var bytes = Data() // a token may end in the middle of a UTF-8 character: decode the whole, each time
        for _ in 0..<nPredict {
            var token = llama_sampler_sample(sampler, ctx, -1)
            if llama_vocab_is_eog(vocab, token) { break }
            bytes.append(piece(token))
            let text = String(decoding: bytes, as: UTF8.self)
            if let cut = stop.compactMap({ text.range(of: $0) }).min(by: { $0.lowerBound < $1.lowerBound }) {
                return String(text[..<cut.lowerBound])
            }
            rc = withUnsafeMutablePointer(to: &token) { llama_decode(ctx, llama_batch_get_one($0, 1)) }
            if rc != 0 { throw LlamaError.decode(rc) }
        }
        return String(decoding: bytes, as: UTF8.self)
    }

    /// With the special tokens parsed (the template has <start_of_turn>…) and BOS added, as llama-server does.
    private func tokenize(_ text: String) -> [llama_token] {
        let len = Int32(text.utf8.count)
        var buf = [llama_token](repeating: 0, count: Int(len) + 8)
        var n = llama_tokenize(vocab, text, len, &buf, Int32(buf.count), true, true)
        if n < 0 {
            buf = [llama_token](repeating: 0, count: Int(-n))
            n = llama_tokenize(vocab, text, len, &buf, Int32(buf.count), true, true)
        }
        return Array(buf.prefix(Int(max(n, 0))))
    }

    private func piece(_ token: llama_token) -> Data {
        var buf = [CChar](repeating: 0, count: 64)
        var n = llama_token_to_piece(vocab, token, &buf, Int32(buf.count), 0, false)
        if n < 0 {
            buf = [CChar](repeating: 0, count: Int(-n))
            n = llama_token_to_piece(vocab, token, &buf, Int32(buf.count), 0, false)
        }
        return buf.withUnsafeBytes { Data($0.prefix(Int(max(n, 0)))) }
    }
}
