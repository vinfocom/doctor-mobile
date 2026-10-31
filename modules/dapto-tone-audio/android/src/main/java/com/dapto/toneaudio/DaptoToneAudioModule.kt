package com.dapto.toneaudio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.PI
import kotlin.math.sin

class DaptoToneAudioModule : Module() {
  private val lock = Any()
  private var track: AudioTrack? = null
  private val handler = Handler(Looper.getMainLooper())
  private var releaseRunnable: Runnable? = null
  private var deviceCallback: AudioDeviceCallback? = null
  private var focusListener: AudioManager.OnAudioFocusChangeListener? = null
  private var focusRequest: AudioFocusRequest? = null
  private val context: Context get() = appContext.reactContext ?: throw IllegalStateException("Audio context is unavailable")

  override fun definition() = ModuleDefinition {
    Name("DaptoToneAudio")
    Events("onAudioUnavailable")

    AsyncFunction("prepare") {
      val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      if (isMonoAudioEnabled()) {
        throw IllegalStateException("Mono audio is enabled on this device. Turn it off in Accessibility audio settings before starting the separate-ear screening.")
      }
      val headsetTypes = setOf(
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        AudioDeviceInfo.TYPE_BLE_HEADSET
      )
      val outputs = if (Build.VERSION.SDK_INT >= 23) manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList() else emptyList()
      val headset = outputs.firstOrNull { it.type in headsetTypes }
      // Do not treat an unknown channel layout as stereo: the hearing screen
      // must not claim separate-ear output unless the route reports 2 channels.
      val stereo = headset != null && headset.channelCounts.any { it >= 2 }
      if (headset != null && stereo) {
        focusListener = AudioManager.OnAudioFocusChangeListener { change ->
          if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            failAudio("Audio was interrupted. The hearing screening has stopped.")
          }
        }
        // Use media playback so the patient's media-volume setting controls the screening tones.
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        val granted = if (Build.VERSION.SDK_INT >= 26) {
          val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(attrs).setOnAudioFocusChangeListener(focusListener!!).build()
          focusRequest = request
          manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
          @Suppress("DEPRECATION")
          manager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
        if (!granted) throw IllegalStateException("Audio is currently interrupted by another audio session. Try again shortly.")
        if (Build.VERSION.SDK_INT >= 23 && deviceCallback == null) {
          deviceCallback = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) { failAudio("Audio output changed. The hearing screening has stopped.") }
            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) { failAudio("Headphone connection changed. The hearing screening has stopped.") }
          }
          manager.registerAudioDeviceCallback(deviceCallback, handler)
        }
      }
      mapOf(
        "headphonesConnected" to (headset != null),
        "stereoOutput" to stereo,
        "routeName" to (headset?.productName?.toString() ?: "No supported headphone route detected")
      )
    }

    AsyncFunction("playTone") { frequencyHz: Int, ear: String, gain: Double, durationMs: Int, promise: Promise ->
      if (frequencyHz !in setOf(250, 500, 1000, 2000, 4000, 8000) || ear !in setOf("left", "right") || !gain.isFinite() || gain !in 0.0..0.09 || durationMs !in 300..900) {
        promise.reject("INVALID_TONE", "Invalid tone parameters.", null)
        return@AsyncFunction
      }
      Thread({
        var candidateTrack: AudioTrack? = null
        try {
          val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
          val headsetTypes = setOf(AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, AudioDeviceInfo.TYPE_BLE_HEADSET)
          val activeHeadset = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).firstOrNull { it.type in headsetTypes }
          if (activeHeadset == null || activeHeadset.channelCounts.none { it >= 2 }) {
            throw IllegalStateException("Headphone route changed or stereo output is unavailable. The screening has stopped.")
          }
          val sampleRate = 44100
          val frames = sampleRate * durationMs / 1000
          val bytes = ByteArray(frames * 2 * 2)
          val fadeFrames = sampleRate * 25 / 1000
          for (frame in 0 until frames) {
            val fadeIn = minOf(1.0, frame.toDouble() / fadeFrames)
            val fadeOut = minOf(1.0, (frames - 1 - frame).toDouble() / fadeFrames)
            val sample = (sin(2.0 * PI * frequencyHz * frame / sampleRate) * gain * minOf(fadeIn, fadeOut) * Short.MAX_VALUE).toInt().toShort()
            val offset = frame * 4
            val value = if (ear == "left") sample.toInt() else 0
            bytes[offset] = value.toByte(); bytes[offset + 1] = (value.toInt() shr 8).toByte()
            val other = if (ear == "right") sample.toInt() else 0
            bytes[offset + 2] = other.toByte(); bytes[offset + 3] = (other.toInt() shr 8).toByte()
          }
          val audioFormat = AudioFormat.Builder().setSampleRate(sampleRate).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_STEREO).build()
          val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
          val audioTrack = AudioTrack.Builder().setAudioAttributes(attributes).setAudioFormat(audioFormat).setTransferMode(AudioTrack.MODE_STATIC).setBufferSizeInBytes(bytes.size).build()
          candidateTrack = audioTrack
          if (audioTrack.setPreferredDevice(activeHeadset) != true) {
            throw IllegalStateException("Could not route the tone to the detected headphones. The screening has stopped.")
          }
          val leftVolume = if (ear == "left") 1f else 0f
          val rightVolume = if (ear == "right") 1f else 0f
          if (audioTrack.setStereoVolume(leftVolume, rightVolume) != AudioTrack.SUCCESS) {
            throw IllegalStateException("Could not isolate the tone to the selected channel. The screening has stopped.")
          }
          if (Build.VERSION.SDK_INT >= 30) {
            // Some Android outputs expose dual-mono presentation, which copies
            // or blends one channel into both ears. Disable it for screening.
            audioTrack.setDualMonoMode(AudioTrack.DUAL_MONO_MODE_OFF)
            if (audioTrack.dualMonoMode != AudioTrack.DUAL_MONO_MODE_OFF) {
              throw IllegalStateException("Android is combining stereo channels. Turn off Mono audio in Accessibility audio settings and try again.")
            }
          }
          val written = audioTrack.write(bytes, 0, bytes.size)
          if (written != bytes.size) throw IllegalStateException("Could not prepare the full tone.")
          synchronized(lock) {
            releaseCurrent()
            track = audioTrack
            candidateTrack = null
            audioTrack.play()
            if (Build.VERSION.SDK_INT >= 23) {
              val routedDevice = audioTrack.routedDevice
              if (routedDevice == null || routedDevice.id != activeHeadset.id) {
                releaseCurrent()
                throw IllegalStateException("Android routed the tone to a different audio output. Reconnect your stereo headphones and restart the screening.")
              }
            }
            releaseRunnable = Runnable { synchronized(lock) { if (track === audioTrack) releaseCurrent() } }
            handler.postDelayed(releaseRunnable!!, durationMs.toLong() + 100L)
          }
          promise.resolve(null)
        } catch (error: Throwable) {
          synchronized(lock) {
            candidateTrack?.let { try { it.release() } catch (_: Throwable) { } }
            candidateTrack = null
            releaseCurrent()
          }
          promise.reject("AUDIO_PLAYBACK_FAILED", error.message ?: "Tone playback failed.", error)
        }
      }, "DaptoTonePlayer").start()
    }

    AsyncFunction("stopTone") { synchronized(lock) { releaseCurrent() } }
    AsyncFunction("cleanup") { cleanupAudio() }
    OnDestroy { cleanupAudio() }
  }

  private fun failAudio(reason: String) {
    synchronized(lock) { releaseCurrent() }
    sendEvent("onAudioUnavailable", mapOf("reason" to reason))
  }

  private fun isMonoAudioEnabled(): Boolean = try {
    val resolver = context.contentResolver
    Settings.Secure.getInt(resolver, "master_mono", 0) == 1 ||
      Settings.Secure.getInt(resolver, "accessibility_mono_audio", 0) == 1
  } catch (_: Throwable) {
    false
  }

  private fun cleanupAudio() {
    synchronized(lock) { releaseCurrent() }
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (Build.VERSION.SDK_INT >= 23) deviceCallback?.let { manager.unregisterAudioDeviceCallback(it) }
    deviceCallback = null
    if (Build.VERSION.SDK_INT >= 26) focusRequest?.let { manager.abandonAudioFocusRequest(it) }
    else if (focusListener != null) {
      @Suppress("DEPRECATION")
      manager.abandonAudioFocus(focusListener)
    }
    focusRequest = null
    focusListener = null
  }

  private fun releaseCurrent() {
    releaseRunnable?.let { handler.removeCallbacks(it) }
    releaseRunnable = null
    track?.let { current ->
      try { if (current.playState == AudioTrack.PLAYSTATE_PLAYING) current.stop() } catch (_: Throwable) { }
      try { current.release() } catch (_: Throwable) { }
    }
    track = null
  }
}
