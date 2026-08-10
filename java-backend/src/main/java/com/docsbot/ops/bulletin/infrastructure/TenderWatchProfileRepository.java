package com.docsbot.ops.bulletin.infrastructure;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.bulletin.domain.TenderWatchProfile;

public interface TenderWatchProfileRepository extends JpaRepository<TenderWatchProfile, Long> {

    /**
     * The one profile. The migration seeds it, so this is expected to find a row; it returns an
     * Optional anyway because a database restored from before V57 would not have one, and the
     * screen going back to "show everything" beats the screen throwing.
     */
    Optional<TenderWatchProfile> findFirstByOrderByIdAsc();
}
