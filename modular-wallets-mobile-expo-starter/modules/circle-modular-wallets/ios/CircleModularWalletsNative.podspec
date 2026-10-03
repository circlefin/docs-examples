require File.join(
  File.dirname(`node --print "require.resolve('react-native/package.json')"`),
  'scripts/react_native_pods'
)

Pod::Spec.new do |s|
  s.name           = 'CircleModularWalletsNative'
  s.version        = '1.0.0'
  s.summary        = 'Expo bridge for the official Circle Modular Wallets mobile SDK'
  s.description    = 'Native passkey registration, reconnect, and signing through the official Circle SDK.'
  s.license        = { :type => 'Apache-2.0' }
  s.author         = 'Wallet Starter'
  s.homepage       = 'https://github.com/circlefin/modularwallets-ios-sdk'
  s.platforms      = { :ios => '16.0' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.source_files   = '**/*.swift'
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  spm_dependency(
    s,
    url: 'https://github.com/circlefin/modularwallets-ios-sdk.git',
    requirement: {
      kind: 'exactVersion',
      version: '1.5.0'
    },
    products: ['CircleModularWalletsCore']
  )
end
