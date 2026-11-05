/// Textes de la mascotte, calculés à partir des réponses (pattern « chaque réponse a sa réplique »).
extension OnboardingHookViewModel {
    var introLine: String {
        "Salut, moi c'est \(Mascot.name) ! Je vais t'aider à créer ton compte en deux minutes. On commence par faire connaissance ?"
    }

    var interestsInsight: String {
        let base = featuredInterest.insight
        guard interests.count >= 3 else { return base }
        return "\(base) Et avec \(interests.count) passions, ton feed ne sera jamais monotone."
    }

    var styleInsight: String {
        switch postingStyle ?? .photos {
        case .photos: "Les photos restent sur ton profil : c'est ta vitrine. Je vais te montrer comme c'est simple."
        case .stories: "Les stories, c'est le quotidien sans prise de tête : elles quittent le bandeau après 24 h."
        case .reels: "Les reels se regardent en plein écran : parfait pour montrer ton univers en mouvement."
        case .watcher: "Aucune pression : suis tes amis, like, commente. Tu publieras quand tu en auras envie."
        }
    }

    var rhythmReaction: String? {
        switch rhythm {
        case .daily: "Tous les jours ? J'adore l'énergie !"
        case .weekly: "Un rendez-vous chaque semaine, c'est le bon rythme."
        case .sometimes: "À ton rythme, c'est toi qui décides."
        case nil: nil
        }
    }

    var celebrationTitle: String {
        isPhotoPublished ? "Ton premier post !" : "Premier like envoyé !"
    }

    var celebrationLine: String {
        isPhotoPublished
            ? "Bravo, c'est exactement comme ça qu'on publie sur Clone. Tes amis vont adorer."
            : "Tu as compris le principe : on soutient ses amis d'un double tap."
    }
}

extension OnboardingInterest {
    /// Réplique de la mascotte quand ce centre d'intérêt est le premier choisi.
    var insight: String {
        switch self {
        case .travel: "Les carnets de voyage font partie des posts qu'on garde le plus. Tes futurs abonnés vont adorer."
        case .food: "Une belle assiette, c'est presque un like assuré. Prépare tes meilleurs angles !"
        case .sport: "Les moments sportifs donnent envie de bouger : tu vas motiver toute ta bande."
        case .art: "Ton regard créatif va se remarquer : les créations originales ressortent dans un feed."
        case .animals: "Les animaux, c'est la valeur sûre du feed. Personne ne résiste à une bonne bouille."
        case .fashion: "Ton style mérite d'être vu : les tenues du jour font toujours réagir."
        case .music: "Concerts, vinyles, sessions studio : la musique crée des liens instantanés."
        }
    }
}

extension OnboardingPostingStyle {
    var title: String {
        switch self {
        case .photos: "Des photos"
        case .stories: "Des stories"
        case .reels: "Des reels"
        case .watcher: "Je regarde surtout"
        }
    }

    var symbol: String {
        switch self {
        case .photos: "photo.on.rectangle.angled"
        case .stories: "circle.dashed"
        case .reels: "play.rectangle.fill"
        case .watcher: "eyes"
        }
    }
}

extension OnboardingRhythm {
    var title: String {
        switch self {
        case .daily: "Tous les jours"
        case .weekly: "Chaque semaine"
        case .sometimes: "De temps en temps"
        }
    }

    var symbol: String {
        switch self {
        case .daily: "sun.max.fill"
        case .weekly: "calendar"
        case .sometimes: "leaf.fill"
        }
    }
}
