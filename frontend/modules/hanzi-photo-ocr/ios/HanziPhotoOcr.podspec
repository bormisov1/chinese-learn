Pod::Spec.new do |s|
  s.name           = 'HanziPhotoOcr'
  s.version        = '1.0.0'
  s.summary        = 'On-device Chinese photo text recognition'
  s.description    = 'Expo bridge for Google ML Kit Text Recognition Chinese.'
  s.author         = 'Hanzi Deck'
  s.homepage       = 'https://developers.google.com/ml-kit/vision/text-recognition/v2'
  s.license        = { :type => 'Proprietary' }
  s.source         = { :git => '' }
  s.platforms      = { :ios => '15.5' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'GoogleMLKit/TextRecognitionChinese', '8.0.0'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
