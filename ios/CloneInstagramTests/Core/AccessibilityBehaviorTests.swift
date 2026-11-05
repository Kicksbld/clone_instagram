import CoreGraphics
import Foundation
import Testing
@testable import CloneInstagram

struct AccessibilityBehaviorTests {
    @Test func voiceOverStopsTheStoryClockButAllowsManualNavigation() async {
        let service = FakeStoryService()
        service.storiesByAuthor["alice"] = .success([
            .fixture(id: "first", authorId: "alice"), .fixture(id: "second", authorId: "alice"),
        ])
        let model = StoryViewerViewModel(
            viewerId: "me", authors: [PostAuthor(id: "alice", username: "alice", avatar: nil)],
            startIndex: 0, service: service, deletions: StoryDeletionStore(service: service)
        )
        await model.start()
        await model.photoDidAppear(storyId: "first")
        model.usesScreenReader = true
        await model.advance(by: 60)
        #expect(model.currentStory?.id == "first")
        #expect(model.progress == 0)
        model.isPaused = true
        await model.next()
        #expect(model.currentStory?.id == "second")
        await model.previous()
        #expect(model.currentStory?.id == "first")
        model.isPaused = false
        model.usesScreenReader = false
        await model.photoDidAppear(storyId: "first")
        await model.advance(by: 5)
        #expect(model.currentStory?.id == "second")
    }

    @Test func descriptionsSurviveAQueueRestartAndKeepTheirOrder() async {
        let store = TemporaryPendingPostStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let descriptions = ["Montagne", "Lac"]
        let media = descriptions.enumerated().map { index, text in
            PendingMedia(
                fileName: "\(index).jpg",
                sizeBytes: 4,
                width: 20,
                height: 20,
                mediaId: "media-\(index)",
                altText: text
            )
        }
        store.save([PendingPost(id: UUID(), authorId: "me", caption: "Paysages", media: media, step: .create)])
        let posts = FakePostService()
        let queue = PublishQueue(store: store, uploads: FakeMediaUploading(), posts: posts)
        queue.resume(for: "me")
        await queue.waitUntilIdle()
        #expect(posts.mediaDescriptions == [descriptions])
        #expect(queue.items.isEmpty)
    }

    @Test func oldPendingMediaWithoutADescriptionStillDecodes() throws {
        let data = Data(#"{"fileName":"photo.jpg","sizeBytes":4,"width":20,"height":20,"mediaId":"media"}"#.utf8)
        let media = try JSONDecoder().decode(PendingMedia.self, from: data)
        #expect(media.altText == nil)
    }

    @Test func photoDescriptionsFollowSelectionOrderAndSurviveAReorder() async {
        let publisher = FakePublisher()
        let model = CreatePostViewModel(authorId: "me", publisher: publisher) { _ throws(ImagePreparationError) in
            guard let image = ImageCropperTests.image(width: 40, height: 30) else { throw .unreadableImage }
            return image
        }
        await model.updateSelection(["one", "two"]) { _ in Data("photo".utf8) }
        model.setAltText("Première", at: 0)
        model.setAltText("Deuxième", at: 1)
        await model.updateSelection(["two", "one"]) { _ in Data("photo".utf8) }
        #expect(model.altText(at: 0) == "Deuxième")
        #expect(await model.share())
        #expect(publisher.published.first?.mediaAltTexts == ["Deuxième", "Première"])
    }

    @Test func accessibleCropCommandsAreBoundedAndCanPreserveTheWholeImage() async throws {
        let model = CreatePostViewModel(authorId: "me", publisher: FakePublisher()) { _ throws(ImagePreparationError) in
            guard let image = ImageCropperTests.image(width: 90, height: 160) else { throw .unreadableImage }
            return image
        }
        await model.loadPhoto(Data("photo".utf8))
        model.commitCrop(zoom: 100, center: CGPoint(x: -100, y: 10000))
        #expect(model.zoom == ImageCropper.maxZoom)
        #expect(model.cropRect.minX >= 0)
        #expect(model.cropRect.maxY <= 160)
        model.keepEntireImage()
        #expect(model.keepsEntireImage)
        let preview = try #require(model.croppedPreviews.first)
        #expect(preview.width == 120)
        #expect(preview.height == 160)
        model.moveCrop(horizontal: 0.1, vertical: 0)
        #expect(!model.keepsEntireImage)
    }

    @Test func descriptionsCanBeEditedWithoutChangingTheCaption() async {
        let service = FakePostService()
        var saved = Post.fixture()
        saved.media[0].altText = "Description corrigée"
        service.updateCaptionResults = [.success(saved)]
        let edits = PostEditStore()
        let model = EditPostViewModel(
            route: EditPostRoute(postId: saved.id, caption: saved.caption, mediaAltTexts: ["Avant"]),
            service: service, edits: edits
        )
        #expect(!model.hasChanges)
        model.mediaAltTexts = ["Description corrigée"]
        #expect(model.hasChanges)
        #expect(await model.save())
        #expect(service.editedDescriptions == [["Description corrigée"]])
        #expect(edits.displayed(.fixture()).media.first?.altText == "Description corrigée")
    }

    @Test func storyDescriptionRetriesWithoutLosingTheDraft() async {
        let service = FakeStoryService()
        service.updateDescriptionError = .unreachable
        var saved: Story?
        let editor = StoryDescriptionViewModel(story: .fixture(id: "story", authorId: "me"), service: service) { saved = $0 }
        editor.text = "Un chat sur un canapé"
        #expect(await !editor.save())
        #expect(editor.errorMessage != nil)
        #expect(editor.text == "Un chat sur un canapé")
        #expect(saved == nil)
        service.updateDescriptionError = nil
        #expect(await editor.save())
        #expect(saved?.photo.altText == "Un chat sur un canapé")
        #expect(service.descriptionUpdates == ["Un chat sur un canapé", "Un chat sur un canapé"])
    }

    @Test func replacingAReelClearsItsPreviousDescription() async {
        let model = CreatePostViewModel(authorId: "me", publisher: FakePublisher())
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        model.selectVideo(directory.appending(path: "first.mp4"))
        model.videoAltText = "Description de la première vidéo"
        model.selectVideo(directory.appending(path: "second.mp4"))
        #expect(model.videoAltText.isEmpty)
        model.videoAltText = "Description de la deuxième vidéo"
        await model.loadVideo { directory.appending(path: "third.mp4") }
        #expect(model.videoAltText.isEmpty)
    }

    @Test func missingDescriptionsAreHonestAndTheFullCaptionRemainsReadable() {
        var post = Post.fixture(caption: "Une longue légende")
        #expect(post.accessibilitySummary(page: 0).contains("Photo sans description"))
        post.media[0].altText = "Un chat sur un canapé"
        let summary = post.accessibilitySummary(page: 0)
        #expect(summary.contains("Un chat sur un canapé"))
        #expect(summary.contains("Une longue légende"))
        #expect(!summary.contains("sans description"))
    }
}
