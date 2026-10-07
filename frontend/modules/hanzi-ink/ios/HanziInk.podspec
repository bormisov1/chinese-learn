Pod::Spec.new do |s|
  s.name           = 'HanziInk'
  s.version        = '1.0.0'
  s.summary        = 'On-device Chinese handwriting recognition'
  s.description    = 'Expo bridge for Google ML Kit Digital Ink Recognition.'
  s.author         = 'Hanzi Handwriting'
  s.homepage       = 'https://developers.google.com/ml-kit/vision/digital-ink-recognition'
  s.license        = { :type => 'Proprietary' }
  # This pod is supplied by the app's local modules directory.
  s.source         = { :git => '' }
  s.platforms      = {
    :ios => '15.5'
  }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleMLKit/DigitalInkRecognition', '8.0.0'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
