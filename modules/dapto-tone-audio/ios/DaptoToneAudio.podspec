Pod::Spec.new do |s|
  s.name = 'DaptoToneAudio'
  s.version = '1.0.0'
  s.summary = 'Native sine-wave audio screening tones for Dapto.'
  s.description = 'A small Expo module for short, generated stereo sine-wave tones.'
  s.license = { :type => 'MIT' }
  s.author = { 'Dapto' => 'engineering@dapto.invalid' }
  s.homepage = 'https://dapto.invalid'
  s.platforms = { :ios => '15.1' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://dapto.invalid/DaptoToneAudio.git', :tag => s.version.to_s }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
