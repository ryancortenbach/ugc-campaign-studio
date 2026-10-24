#!/usr/bin/env swift
// Ask the running Mint Labs app to save a PNG of one page: swift desktop/snapshot.swift "#/tasks" [lead|spend|integrations|bottom]
// Files land in ~/Library/Caches/Mint Labs/snapshots.
import Foundation

let request = CommandLine.arguments.dropFirst().joined(separator: " ")
DistributedNotificationCenter.default().postNotificationName(Notification.Name("com.mintlabs.snapshot"), object: request, userInfo: nil, deliverImmediately: true)
