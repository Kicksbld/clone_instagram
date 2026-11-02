import AVFoundation
import Foundation

/// Export local sans métadonnées : MP4 H.264/AAC, 4 Mb/s, 60 s au plus (ADR-024).
nonisolated enum VideoPreparer {
    @concurrent
    static func prepare(_ source: URL, in directory: URL) async throws -> PreparedImage {
        let asset = AVURLAsset(url: source)
        guard let track = try await asset.loadTracks(withMediaType: .video).first else { throw UploadError.rejected(.invalidVideo) }
        let size = try await track.load(.naturalSize)
        let transform = try await track.load(.preferredTransform)
        guard size.width.isFinite, size.height.isFinite, size.width > 0, size.height > 0 else { throw UploadError.rejected(.invalidVideo) }
        let scale = min(1, 720 / min(size.width, size.height))
        let width = max(2, Int(size.width * scale / 2) * 2)
        let height = max(2, Int(size.height * scale / 2) * 2)
        let duration = try await min(60, asset.load(.duration).seconds)
        guard duration.isFinite, duration > 0 else { throw UploadError.rejected(.invalidVideo) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let url = directory.appending(path: "\(UUID().uuidString).mp4")
        do {
            let reader = try AVAssetReader(asset: asset)
            reader.timeRange = CMTimeRange(start: .zero, duration: CMTime(seconds: duration, preferredTimescale: 600))
            let video = AVAssetReaderTrackOutput(
                track: track,
                outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange]
            )
            reader.add(video)
            let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
            writer.metadata = []
            let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
                AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
                AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
                AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 4_000_000],
            ])
            input.transform = CGAffineTransform(
                a: transform.a,
                b: transform.b,
                c: transform.c,
                d: transform.d,
                tx: transform.tx * scale,
                ty: transform.ty * scale
            )
            writer.add(input)
            var audio: AVAssetReaderTrackOutput?
            var audioInput: AVAssetWriterInput?
            if let track = try await asset.loadTracks(withMediaType: .audio).first {
                let output = AVAssetReaderTrackOutput(track: track, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
                let destination = AVAssetWriterInput(
                    mediaType: .audio,
                    outputSettings: [
                        AVFormatIDKey: kAudioFormatMPEG4AAC,
                        AVSampleRateKey: 44100,
                        AVNumberOfChannelsKey: 2,
                        AVEncoderBitRateKey: 128_000,
                    ]
                )
                reader.add(output)
                writer.add(destination)
                audio = output
                audioInput = destination
            }
            guard writer.startWriting(), reader.startReading() else { throw UploadError.rejected(.invalidVideo) }
            writer.startSession(atSourceTime: .zero)
            var videoDone = false
            var audioDone = audio == nil
            while !videoDone || !audioDone {
                try Task.checkCancellation()
                guard writer.status == .writing, reader.status != .failed else { throw UploadError.rejected(.invalidVideo) }
                var advanced = false
                if !videoDone, input.isReadyForMoreMediaData {
                    if let sample = video.copyNextSampleBuffer() {
                        guard input.append(sample) else { throw UploadError.rejected(.invalidVideo) }
                    } else {
                        input.markAsFinished(); videoDone = true
                    }
                    advanced = true
                }
                if !audioDone, let audio, let audioInput, audioInput.isReadyForMoreMediaData {
                    if let sample = audio.copyNextSampleBuffer() {
                        guard audioInput.append(sample) else { throw UploadError.rejected(.invalidVideo) }
                    } else {
                        audioInput.markAsFinished(); audioDone = true
                    }
                    advanced = true
                }
                if !advanced {
                    try await Task.sleep(for: .milliseconds(2))
                }
            }
            await writer.finishWriting()
            guard writer.status == .completed else { throw UploadError.rejected(.invalidVideo) }
            let bytes = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard bytes > 0, bytes <= 50 * 1024 * 1024 else { throw UploadError.rejected(.fileTooLarge) }
            let rotated = abs(transform.b) > 0.5
            return PreparedImage(
                fileURL: url,
                sizeBytes: bytes,
                mimeType: "video/mp4",
                width: rotated ? height : width,
                height: rotated ? width : height
            )
        } catch {
            try? FileManager.default.removeItem(at: url)
            throw error
        }
    }
}
