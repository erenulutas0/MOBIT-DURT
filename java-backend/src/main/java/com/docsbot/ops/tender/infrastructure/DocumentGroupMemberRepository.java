package com.docsbot.ops.tender.infrastructure;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.docsbot.ops.tender.domain.DocumentGroupMember;

public interface DocumentGroupMemberRepository extends JpaRepository<DocumentGroupMember, Long> {
    boolean existsByGroupIdAndUserId(long groupId, long userId);
    Optional<DocumentGroupMember> findByGroupIdAndUserId(long groupId, long userId);
    List<DocumentGroupMember> findAllByGroupIdOrderByCreatedAtAscIdAsc(long groupId);
    List<DocumentGroupMember> findAllByUserIdOrderByCreatedAtDescIdDesc(long userId);
    void deleteByGroupIdAndUserId(long groupId, long userId);
}
