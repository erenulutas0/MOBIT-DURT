package com.docsbot.ops.tender.infrastructure;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.docsbot.ops.tender.domain.DocumentGroupMember;

public interface DocumentGroupMemberRepository extends JpaRepository<DocumentGroupMember, Long> {
    boolean existsByGroupIdAndUserId(long groupId, long userId);
    Optional<DocumentGroupMember> findByGroupIdAndUserId(long groupId, long userId);
    List<DocumentGroupMember> findAllByGroupIdOrderByCreatedAtAscIdAsc(long groupId);
    List<DocumentGroupMember> findAllByUserIdOrderByCreatedAtDescIdDesc(long userId);
    void deleteByGroupIdAndUserId(long groupId, long userId);

    @Query("""
            select new com.docsbot.ops.tender.infrastructure.GroupCount(member.groupId, count(member.id))
            from DocumentGroupMember member
            where member.groupId in :groupIds
            group by member.groupId
            """)
    List<GroupCount> countMembersByGroupIdIn(@Param("groupIds") Collection<Long> groupIds);
}
