import AVFoundation
import ExpoModulesCore

public class DaptoToneAudioModule: Module {
  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private var isPrepared = false
  private var isAttached = false
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("DaptoToneAudio")
    Events("onAudioUnavailable")

    AsyncFunction("prepare") { () -> [String: Any] in
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [])
      try session.setActive(true)
      let headphonePorts: Set<AVAudioSession.Port> = [.headphones, .bluetoothA2DP, .bluetoothLE, .usbAudio, .lineOut]
      let route = session.currentRoute.outputs.first(where: { headphonePorts.contains($0.portType) })
      let hasHeadphones = route != nil
      if !isAttached {
        engine.attach(player)
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
        engine.connect(player, to: engine.mainMixerNode, format: format)
        isAttached = true
      }
      try engine.start()
      isPrepared = true
      beginMonitoringAudioSession()
      let outputChannels = engine.outputNode.outputFormat(forBus: 0).channelCount
      return ["headphonesConnected": hasHeadphones, "stereoOutput": hasHeadphones && outputChannels >= 2, "routeName": route?.portName ?? "No supported headphone route detected"]
    }

    AsyncFunction("playTone") { (frequencyHz: Int, ear: String, gain: Double, durationMs: Int) throws -> Void in
      let session = AVAudioSession.sharedInstance()
      let headphonePorts: Set<AVAudioSession.Port> = [.headphones, .bluetoothA2DP, .bluetoothLE, .usbAudio, .lineOut]
      let routeAvailable = session.currentRoute.outputs.contains(where: { headphonePorts.contains($0.portType) })
      guard [250, 500, 1000, 2000, 4000, 8000].contains(frequencyHz), ["left", "right"].contains(ear), gain.isFinite, (0.0...0.06).contains(gain), (300...900).contains(durationMs), isPrepared, routeAvailable else {
        throw NSError(domain: "DaptoToneAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid tone settings or audio is not ready."])
      }
      let sampleRate = 44100.0
      let frameCount = AVAudioFrameCount(Int(sampleRate * Double(durationMs) / 1000.0))
      let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 2)!
      guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount), let channels = buffer.floatChannelData else {
        throw NSError(domain: "DaptoToneAudio", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not create audio buffer."])
      }
      buffer.frameLength = frameCount
      let fadeFrames = sampleRate * 0.025
      for frame in 0..<Int(frameCount) {
        let envelope = min(1.0, min(Double(frame) / fadeFrames, Double(Int(frameCount) - 1 - frame) / fadeFrames))
        let value = Float(sin(2.0 * Double.pi * Double(frequencyHz) * Double(frame) / sampleRate) * gain * envelope)
        channels[0][frame] = ear == "left" ? value : 0
        channels[1][frame] = ear == "right" ? value : 0
      }
      player.stop()
      player.scheduleBuffer(buffer, at: nil, options: [], completionHandler: nil)
      player.play()
    }

    AsyncFunction("stopTone") { player.stop() }
    AsyncFunction("cleanup") {
      player.stop()
      if engine.isRunning { engine.stop() }
      isPrepared = false
      endMonitoringAudioSession()
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
    OnDestroy {
      player.stop()
      if engine.isRunning { engine.stop() }
      isPrepared = false
      endMonitoringAudioSession()
      try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
  }

  private func beginMonitoringAudioSession() {
    guard observers.isEmpty else { return }
    let center = NotificationCenter.default
    observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self, self.isPrepared else { return }
      self.player.stop()
      self.isPrepared = false
      self.sendEvent("onAudioUnavailable", ["reason": "Audio output changed. The hearing screening has stopped."])
    })
    observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] notification in
      guard let self, self.isPrepared,
            let rawType = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            rawType == AVAudioSession.InterruptionType.began.rawValue else { return }
      self.player.stop()
      self.isPrepared = false
      self.sendEvent("onAudioUnavailable", ["reason": "Audio was interrupted. The hearing screening has stopped."])
    })
  }

  private func endMonitoringAudioSession() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers.removeAll()
  }
}
