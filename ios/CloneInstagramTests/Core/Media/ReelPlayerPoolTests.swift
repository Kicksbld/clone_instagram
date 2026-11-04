import AVFoundation
import Foundation
import Testing
@testable import CloneInstagram

struct ReelPlayerPoolTests {
    @Test func `le reel préchargé réutilise son lecteur et son item`() {
        let pool = ReelPlayerPool()
        let firstURL = URL(fileURLWithPath: "/first.m3u8")
        let nextURL = URL(fileURLWithPath: "/next.m3u8")
        let first = pool.play(firstURL)
        let next = pool.preload(nextURL)
        let item = next.currentItem
        #expect(first !== next)
        #expect(next.rate == 0)
        #expect(pool.play(nextURL) === next)
        #expect(next.currentItem === item)
        #expect(first.rate == 0)
        #expect(next.isMuted)
        pool.pause()
        #expect(next.rate == 0)
    }

    @Test func `réessayer remplace le média en échec dans le même lecteur`() {
        let pool = ReelPlayerPool()
        let url = URL(fileURLWithPath: "/retry.m3u8")
        let player = pool.play(url)
        let item = player.currentItem
        #expect(pool.play(url, reload: true) === player)
        #expect(player.currentItem !== item)
        pool.pause()
    }
}
